import http from 'http';
import https from 'https';
import tls from 'tls';
import dns from 'dns';
import zlib from 'zlib';
import { URL } from 'url';
import { HttpResponseData, TlsCertificateInfo } from './types';

const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;
const MAX_BODY_SIZE = 3 * 1024 * 1024; // 3 MB
const USER_AGENT = 'Mozilla/5.0 (compatible; RankAutonomousWebsiteChecker/1.0; +https://rankautonomous.com/bot)';

/**
 * Strict check for private, local, loopback, or cloud-metadata IP addresses.
 */
export function isPrivateIP(ip: string): boolean {
  if (!ip) return true;

  // IPv4 Checks
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, o1Str, o2Str] = ipv4Match;
    const o1 = Number(o1Str);
    const o2 = Number(o2Str);

    if (
      o1 === 10 || // 10.0.0.0/8
      o1 === 127 || // 127.0.0.0/8 (Loopback)
      o1 === 0 || // 0.0.0.0/8
      (o1 === 172 && o2 >= 16 && o2 <= 31) || // 172.16.0.0/12
      (o1 === 192 && o2 === 168) || // 192.168.0.0/16
      (o1 === 169 && o2 === 254) || // 169.254.0.0/16 (Link-local & AWS metadata 169.254.169.254)
      (o1 === 100 && o2 >= 64 && o2 <= 127) // 100.64.0.0/10 (CGNAT / Cloud Metadata)
    ) {
      return true;
    }
    return false;
  }

  // IPv6 Checks
  const lower = ip.toLowerCase().trim();
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1' || lower === '::' || lower === '0:0:0:0:0:0:0:0') {
    return true; // Loopback or unspecified
  }

  // Unique Local Addresses (fc00::/7)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

  // Link-local (fe80::/10)
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (lower.startsWith('::ffff:')) {
    const v4Part = lower.substring(7);
    return isPrivateIP(v4Part);
  }

  return false;
}

/**
 * Custom DNS lookup interceptor preventing DNS rebinding & SSRF
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

    const addresses = Array.isArray(address) ? address.map(a => a.address) : [address as string];

    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        const error = new Error(`SSRF blocked: Hostname ${hostname} resolved to private/restricted IP (${ip})`) as NodeJS.ErrnoException;
        error.code = 'SSRF_BLOCKED';
        return callback(error, address, family);
      }
    }

    callback(null, address, family);
  });
}

const safeHttpAgent = new http.Agent({ lookup: safeLookup, keepAlive: false });
const safeHttpsAgent = new https.Agent({ lookup: safeLookup, keepAlive: false });

export function validatePreflightUrl(urlStr: string): { valid: true; parsed: URL } | { valid: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, error: 'Invalid URL provided.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Unsupported protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isPrivateIP(hostname)
  ) {
    return { valid: false, error: `SSRF blocked: Target ${hostname} is a restricted or local destination.` };
  }

  return { valid: true, parsed };
}

/**
 * Decompresses HTTP response body if encoded
 */
function decompressBuffer(buf: Buffer, encoding: string | null): Buffer {
  if (!encoding) return buf;
  const enc = encoding.toLowerCase();
  try {
    if (enc.includes('gzip')) {
      return zlib.gunzipSync(buf);
    }
    if (enc.includes('br')) {
      return zlib.brotliDecompressSync(buf);
    }
    if (enc.includes('deflate')) {
      return zlib.inflateSync(buf);
    }
  } catch (e) {
    // If decompression fails, return raw buffer as fallback
  }
  return buf;
}

/**
 * Performs a secure, evidence-based HTTP fetch with monotonic response timings,
 * SSL certificate inspection, redirect tracking, and strict SSRF defenses.
 */
export async function fetchWebsiteAnalysis(initialUrl: string): Promise<HttpResponseData> {
  let currentUrl = initialUrl;
  let redirects = 0;
  const redirectChain: string[] = [];
  const visitedUrls = new Set<string>();

  while (redirects <= MAX_REDIRECTS) {
    const preflight = validatePreflightUrl(currentUrl);
    if (!preflight.valid) {
      throw new Error(preflight.error);
    }

    if (visitedUrls.has(currentUrl)) {
      throw new Error(`Redirect loop detected at ${currentUrl}`);
    }
    visitedUrls.add(currentUrl);

    const targetUrl = preflight.parsed;
    const isHttps = targetUrl.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;
    const agent = isHttps ? safeHttpsAgent : safeHttpAgent;

    const result = await new Promise<{
      redirectUrl?: string;
      response?: HttpResponseData;
    }>((resolve, reject) => {
      let headersTimestamp: bigint | null = null;
      let rawTlsInfo: TlsCertificateInfo | null = null;

      const reqStartTime = process.hrtime.bigint();

      const options: https.RequestOptions = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: (targetUrl.pathname || '/') + targetUrl.search,
        method: 'GET',
        agent,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'close'
        },
        timeout: TIMEOUT_MS
      };

      const req = requestFn(options, (res) => {
        headersTimestamp = process.hrtime.bigint();

        // Inspect TLS certificate if HTTPS
        if (isHttps) {
          try {
            const tlsSocket = res.socket as tls.TLSSocket;
            if (tlsSocket && typeof tlsSocket.getPeerCertificate === 'function') {
              const peerCert = tlsSocket.getPeerCertificate(true);
              const isAuthorized = tlsSocket.authorized;
              const authError = tlsSocket.authorizationError ? String(tlsSocket.authorizationError) : null;
              const protocol = tlsSocket.getProtocol ? tlsSocket.getProtocol() : null;

              if (peerCert && Object.keys(peerCert).length > 0) {
                const validTo = peerCert.valid_to || null;
                const validFrom = peerCert.valid_from || null;
                let daysRemaining: number | null = null;

                if (validTo) {
                  const validToMs = Date.parse(validTo);
                  if (!isNaN(validToMs)) {
                    daysRemaining = Math.floor((validToMs - Date.now()) / (1000 * 60 * 60 * 24));
                  }
                }

                const issuerStr = peerCert.issuer 
                  ? (peerCert.issuer.O || peerCert.issuer.CN || JSON.stringify(peerCert.issuer))
                  : null;

                const subjectStr = peerCert.subject
                  ? (peerCert.subject.CN || peerCert.subject.O || JSON.stringify(peerCert.subject))
                  : null;

                rawTlsInfo = {
                  issuer: issuerStr,
                  subject: subjectStr,
                  validFrom,
                  validTo,
                  daysRemaining,
                  authorized: isAuthorized,
                  authorizationError: authError,
                  protocol
                };
              }
            }
          } catch (tlsErr) {
            // Ignore socket inspection errors
          }
        }

        const statusCode = res.statusCode || 0;
        const statusText = res.statusMessage || '';

        // Handle Redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
          try {
            const nextHop = new URL(res.headers.location, currentUrl).href;
            req.destroy();
            return resolve({ redirectUrl: nextHop });
          } catch {
            // Invalid redirect URL, fall through to error
          }
        }

        // Validate content-type
        const contentTypeHeader = (res.headers['content-type'] || '').toLowerCase();
        if (statusCode >= 200 && statusCode < 300 && !contentTypeHeader.includes('text/html') && !contentTypeHeader.includes('application/xhtml+xml')) {
          req.destroy();
          return reject(new Error(`The target URL returned non-HTML content (${contentTypeHeader || 'unknown'}). Website Checker requires an HTML web page.`));
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_BODY_SIZE) {
            req.destroy();
            return reject(new Error(`Page is too large to analyze. Maximum HTML download limit is ${MAX_BODY_SIZE / (1024 * 1024)} MB.`));
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const reqEndTime = process.hrtime.bigint();

          const ttfbNano = headersTimestamp ? Number(headersTimestamp - reqStartTime) : 0;
          const downloadNano = headersTimestamp ? Number(reqEndTime - headersTimestamp) : 0;
          const totalNano = Number(reqEndTime - reqStartTime);

          const ttfbMs = Math.round((ttfbNano / 1e6) * 10) / 10;
          const downloadMs = Math.round((downloadNano / 1e6) * 10) / 10;
          const totalMs = Math.round((totalNano / 1e6) * 10) / 10;

          const rawBuffer = Buffer.concat(chunks);
          const contentEncoding = (res.headers['content-encoding'] as string) || null;
          const decompressed = decompressBuffer(rawBuffer, contentEncoding);
          const html = decompressed.toString('utf8');

          const normalizedHeaders: Record<string, string> = {};
          for (const [key, val] of Object.entries(res.headers)) {
            if (val !== undefined) {
              normalizedHeaders[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : val;
            }
          }

          resolve({
            response: {
              initialUrl,
              finalUrl: currentUrl,
              statusCode,
              statusText,
              redirectCount: redirects,
              redirectChain,
              contentType: contentTypeHeader,
              contentEncoding,
              headers: normalizedHeaders,
              html,
              htmlSizeBytes: rawBuffer.length,
              timings: {
                ttfbMs,
                downloadMs,
                totalMs
              },
              tls: rawTlsInfo,
              isHttps
            }
          });
        });

        res.on('error', (err) => {
          reject(new Error(`Network stream error: ${err.message}`));
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${TIMEOUT_MS / 1000} seconds.`));
      });

      req.on('error', (err: any) => {
        if (err.code === 'SSRF_BLOCKED' || err.message?.includes('SSRF blocked')) {
          reject(new Error(err.message));
        } else if (err.code === 'ENOTFOUND') {
          reject(new Error(`DNS resolution failed for hostname ${targetUrl.hostname}. Website could not be found.`));
        } else if (err.code === 'ECONNREFUSED') {
          reject(new Error(`Connection refused by ${targetUrl.hostname}. Port may be closed or host is unreachable.`));
        } else if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
          reject(new Error(`SSL/TLS certificate error: ${err.message}`));
        } else {
          reject(new Error(`Failed to crawl website: ${err.message || 'Network error'}`));
        }
      });

      req.end();
    });

    if (result.redirectUrl) {
      redirectChain.push(result.redirectUrl);
      currentUrl = result.redirectUrl;
      redirects++;
      continue;
    }

    if (result.response) {
      return result.response;
    }
  }

  throw new Error(`Too many redirects encountered (max ${MAX_REDIRECTS}).`);
}

/**
 * Safely checks robots.txt for the site's origin without throwing fatal errors.
 */
export async function checkRobotsTxtSafely(originUrl: string): Promise<{
  accessible: boolean;
  statusCode: number | null;
  content: string | null;
  disallowsRoot: boolean;
}> {
  try {
    const parsed = new URL(originUrl);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

    const preflight = validatePreflightUrl(robotsUrl);
    if (!preflight.valid) {
      return { accessible: false, statusCode: null, content: null, disallowsRoot: false };
    }

    const isHttps = parsed.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;
    const agent = isHttps ? safeHttpsAgent : safeHttpAgent;

    const res = await new Promise<{ statusCode: number; content: string }>((resolve, reject) => {
      const req = requestFn(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: '/robots.txt',
          method: 'GET',
          agent,
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/plain, */*',
            'Connection': 'close'
          },
          timeout: 4000
        },
        (response) => {
          const statusCode = response.statusCode || 0;
          const chunks: Buffer[] = [];
          response.on('data', (c) => chunks.push(c));
          response.on('end', () => {
            const content = Buffer.concat(chunks).toString('utf8');
            resolve({ statusCode, content });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });
      req.on('error', (err) => reject(err));
      req.end();
    });

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const lower = res.content.toLowerCase();
      // Check for generic or global disallow of root
      const disallowsRoot = /disallow:\s*\/\s*($|\n|\r)/i.test(res.content);
      return {
        accessible: true,
        statusCode: res.statusCode,
        content: res.content.substring(0, 1000), // Cap length
        disallowsRoot
      };
    }

    return {
      accessible: false,
      statusCode: res.statusCode,
      content: null,
      disallowsRoot: false
    };
  } catch {
    return {
      accessible: false,
      statusCode: null,
      content: null,
      disallowsRoot: false
    };
  }
}
