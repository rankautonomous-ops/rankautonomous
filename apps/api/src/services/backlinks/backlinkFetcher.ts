import dns from 'dns';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import robotsParser from 'robots-parser';
import { FetchResult, FetchErrorCode } from './types';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10000;
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB
const USER_AGENT = 'RankAutonomousBot/1.0';

/**
 * Checks if an IP address is considered private, local, or otherwise restricted.
 * Blocks IPv4:
 * - 10.0.0.0/8
 * - 127.0.0.0/8
 * - 172.16.0.0/12
 * - 192.168.0.0/16
 * - 169.254.0.0/16 (Link-local)
 * - 0.0.0.0/8
 * - 100.64.0.0/10 (CGNAT / Cloud Metadata)
 * Blocks IPv6:
 * - ::1/128 (Loopback)
 * - fc00::/7 (Unique local)
 * - fe80::/10 (Link-local)
 */
export function isPrivateIP(ip: string): boolean {
  // IPv4 Checks
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, o1Str, o2Str] = ipv4Match;
    const o1 = Number(o1Str);
    const o2 = Number(o2Str);
    
    if (
      o1 === 10 || 
      o1 === 127 || 
      o1 === 0 ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168) ||
      (o1 === 169 && o2 === 254) ||
      (o1 === 100 && o2 >= 64 && o2 <= 127)
    ) {
      return true;
    }
    return false;
  }

  // IPv6 Checks
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (ip === '::' || ip === '0:0:0:0:0:0:0:0') return true;
  
  const ipv6Lower = ip.toLowerCase();
  if (ipv6Lower.startsWith('fc') || ipv6Lower.startsWith('fd')) return true; // fc00::/7
  if (ipv6Lower.startsWith('fe8') || ipv6Lower.startsWith('fe9') || ipv6Lower.startsWith('fea') || ipv6Lower.startsWith('feb')) return true; // fe80::/10

  // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  if (ipv6Lower.startsWith('::ffff:')) {
    const v4Part = ipv6Lower.substring(7);
    return isPrivateIP(v4Part);
  }

  return false;
}

/**
 * A custom dns.lookup replacement that intercepts the resolved IP and blocks it
 * if it belongs to a private network. Because this IP is fed directly into the
 * socket creation, DNS rebinding is strictly prevented.
 */
export function safeLookup(
  hostname: string, 
  options: dns.LookupOptions, 
  callback: (err: NodeJS.ErrnoException | null, address: any, family: any) => void
): void {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) {
      return callback(err, address, family);
    }
    
    // Address can be a string or an array of objects if { all: true } was passed
    const addresses = Array.isArray(address) ? address.map(a => a.address) : [address as string];
    
    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        const error = new Error(`SSRF blocked: Hostname ${hostname} resolved to a private IP`) as NodeJS.ErrnoException;
        error.code = 'SSRF_BLOCKED';
        return callback(error, address, family);
      }
    }
    
    callback(null, address, family);
  });
}

// Create custom agents bound to the safeLookup function.
// This is the core of the DNS rebinding protection.
const safeHttpAgent = new http.Agent({ lookup: safeLookup });
const safeHttpsAgent = new https.Agent({ lookup: safeLookup });

/**
 * Validates the URL before making any network requests.
 * Checks protocol and early obvious SSRF signs (like localhost).
 */
export function validateUrlPreflight(urlString: string): { valid: true; parsedUrl: URL } | { valid: false; errorCode: FetchErrorCode; errorMessage: string } {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { valid: false, errorCode: 'INVALID_URL', errorMessage: 'Invalid URL format' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { valid: false, errorCode: 'UNSUPPORTED_PROTOCOL', errorMessage: 'Only HTTP and HTTPS protocols are allowed' };
  }
  
  // Early check for obvious dangerous hostnames
  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return { valid: false, errorCode: 'SSRF_BLOCKED', errorMessage: 'Localhost and local network targets are blocked' };
  }

  return { valid: true, parsedUrl };
}

/**
 * Checks the target URL against its origin's robots.txt.
 * Uses fetchSafely recursively to get the robots.txt file, ensuring the
 * robots.txt fetch itself is also protected against SSRF.
 */
export async function checkRobotsTxt(targetUrl: URL): Promise<{ allowed: boolean }> {
  try {
    const robotsUrl = `${targetUrl.protocol}//${targetUrl.host}/robots.txt`;
    
    // Use the safe fetcher, but restrict redirects to 1 and size to 500KB to prevent abuse
    // through massive robots.txt files or endless robots redirects.
    const result = await _fetchInternal(robotsUrl, 1, 500 * 1024);
    
    if (result.success && result.statusCode === 200 && result.body) {
      const robots = robotsParser(robotsUrl, result.body);
      // If undefined is returned, it means allowed (no rule).
      const isAllowed = robots.isAllowed(targetUrl.href, USER_AGENT) ?? true;
      return { allowed: isAllowed };
    }
    
    // If robots.txt doesn't exist (404), fails to parse, or timeouts, default to ALLOWED.
    return { allowed: true };
  } catch (err) {
    // Failsafe: if the robots.txt request blows up entirely, default to allowed
    return { allowed: true };
  }
}

/**
 * The internal recursive fetching logic that powers `fetchSafely`.
 */
function _fetchInternal(urlString: string, maxRedirects: number, maxBodySize: number, currentRedirects = 0): Promise<FetchResult> {
  return new Promise((resolve) => {
    const preflight = validateUrlPreflight(urlString);
    if (!preflight.valid) {
      return resolve({
        success: false,
        finalUrl: urlString,
        redirectCount: currentRedirects,
        errorCode: preflight.errorCode,
        errorMessage: preflight.errorMessage
      });
    }

    const targetUrl = preflight.parsedUrl;
    const isHttps = targetUrl.protocol === 'https:';
    const requestMethod = isHttps ? https.request : http.request;
    const agent = isHttps ? safeHttpsAgent : safeHttpAgent;

    const options = {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: 'GET',
      agent: agent,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: TIMEOUT_MS
    };

    let responseAborted = false;

    const req = requestMethod(options, (res) => {
      const statusCode = res.statusCode || 0;
      
      // Handle Redirects (301, 302, 303, 307, 308)
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        if (currentRedirects >= maxRedirects) {
          res.resume(); // consume response data to free up memory
          return resolve({
            success: false,
            finalUrl: urlString,
            statusCode,
            redirectCount: currentRedirects,
            errorCode: 'TOO_MANY_REDIRECTS',
            errorMessage: `Exceeded maximum of ${maxRedirects} redirects`
          });
        }
        
        // Resolve the redirect URL relative to the current URL
        try {
          const redirectUrl = new URL(res.headers.location, targetUrl.href).href;
          res.resume(); 
          return resolve(_fetchInternal(redirectUrl, maxRedirects, maxBodySize, currentRedirects + 1));
        } catch {
          res.resume();
          return resolve({
            success: false,
            finalUrl: urlString,
            statusCode,
            redirectCount: currentRedirects,
            errorCode: 'INVALID_URL',
            errorMessage: 'Redirect provided an invalid URL'
          });
        }
      }

      // We reached the final destination.
      const contentType = res.headers['content-type'];
      let downloadedBytes = 0;
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > maxBodySize) {
          responseAborted = true;
          req.destroy();
          return resolve({
            success: false,
            finalUrl: urlString,
            statusCode,
            contentType,
            redirectCount: currentRedirects,
            errorCode: 'TOO_LARGE',
            errorMessage: `Response exceeded size limit of ${maxBodySize} bytes`
          });
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        if (responseAborted) return;
        
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({
          success: true,
          finalUrl: urlString,
          statusCode,
          contentType,
          body,
          redirectCount: currentRedirects
        });
      });
    });

    req.on('timeout', () => {
      responseAborted = true;
      req.destroy();
      resolve({
        success: false,
        finalUrl: urlString,
        redirectCount: currentRedirects,
        errorCode: 'TIMEOUT',
        errorMessage: 'Request timed out'
      });
    });

    req.on('error', (err: any) => {
      if (responseAborted) return;
      
      let errorCode: FetchErrorCode = 'NETWORK_ERROR';
      let errorMessage = err.message || 'Unknown network error';

      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        errorCode = 'DNS_FAILURE';
        errorMessage = 'DNS resolution failed';
      } else if (err.code === 'SSRF_BLOCKED') {
        errorCode = 'SSRF_BLOCKED';
        errorMessage = err.message;
      }

      resolve({
        success: false,
        finalUrl: urlString,
        redirectCount: currentRedirects,
        errorCode,
        errorMessage
      });
    });

    req.end();
  });
}

/**
 * Safely fetches a URL.
 * It enforces SSRF protections, DNS-rebinding protections, redirects, sizes, timeouts, and robots.txt.
 */
export async function fetchSafely(urlString: string): Promise<FetchResult> {
  const preflight = validateUrlPreflight(urlString);
  if (!preflight.valid) {
    return {
      success: false,
      finalUrl: urlString,
      redirectCount: 0,
      errorCode: preflight.errorCode,
      errorMessage: preflight.errorMessage
    };
  }

  // Check robots.txt first
  const robotsCheck = await checkRobotsTxt(preflight.parsedUrl);
  if (!robotsCheck.allowed) {
    return {
      success: false,
      finalUrl: preflight.parsedUrl.href,
      redirectCount: 0,
      errorCode: 'ROBOTS_BLOCKED',
      errorMessage: 'Access denied by robots.txt'
    };
  }

  // Fetch the page
  return _fetchInternal(preflight.parsedUrl.href, MAX_REDIRECTS, MAX_BODY_SIZE, 0);
}
