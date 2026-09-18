import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify((hostname: string, callback: any) => dns.lookup(hostname, callback));

export function isPrivateIp(ip: string): boolean {
  // Handles IPv4
  const parts = ip.split('.').map(Number);
  if (parts.length === 4) {
    const [o1, o2] = parts;
    if (o1 === 10) return true; // 10.0.0.0/8
    if (o1 === 127) return true; // 127.0.0.0/8
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16
    if (o1 === 0) return true; // 0.0.0.0/8
    return false;
  }

  // IPv6 checks
  const ipLower = ip.toLowerCase();
  
  // Loopback
  if (ipLower === '::1' || ipLower === '0:0:0:0:0:0:0:1') return true;
  
  // Unique Local Addresses (fc00::/7)
  if (ipLower.startsWith('fc') || ipLower.startsWith('fd')) return true;

  // Link-local (fe80::/10)
  if (ipLower.startsWith('fe8') || ipLower.startsWith('fe9') || ipLower.startsWith('fea') || ipLower.startsWith('feb')) return true;

  // IPv4-mapped IPv6
  if (ipLower.startsWith('::ffff:')) {
    const v4 = ipLower.split('::ffff:')[1];
    if (v4) return isPrivateIp(v4);
  }

  return false;
}

export interface SsrfFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  maxRedirects?: number;
  timeoutMs?: number;
}

/**
 * Safely fetches a URL while preventing SSRF attacks and DNS rebinding.
 * Follows redirects up to maxRedirects, checking each hop.
 * Supports both options object and legacy positional parameters.
 */
export async function ssrfSafeFetch(
  url: string,
  optionsOrMaxRedirects?: number | SsrfFetchOptions,
  legacyTimeoutMs = 10000
): Promise<Response> {
  const opts: SsrfFetchOptions =
    typeof optionsOrMaxRedirects === 'object' && optionsOrMaxRedirects !== null
      ? optionsOrMaxRedirects
      : {
          maxRedirects: typeof optionsOrMaxRedirects === 'number' ? optionsOrMaxRedirects : 5,
          timeoutMs: legacyTimeoutMs,
        };

  const maxRedirects = opts.maxRedirects ?? 5;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const method = (opts.method || 'GET').toUpperCase();
  const customHeaders = opts.headers || {};
  const body = opts.body;

  let currentUrl = url;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const parsed = new URL(currentUrl);

    // Strict protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsafe protocol: ${parsed.protocol}`);
    }

    // SSRF Prevention: DNS Lookup to check actual IP
    let ip;
    try {
      const result: any = await lookup(parsed.hostname);
      ip = result.address || result;
    } catch (error: any) {
      throw new Error(`DNS lookup failed for ${parsed.hostname}: ${error.message}`);
    }

    if (isPrivateIp(ip)) {
      throw new Error(`SSRF Prevention: Resolved IP ${ip} for ${parsed.hostname} is a private/local address.`);
    }

    // Setup Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestHeaders: Record<string, string> = {
        'User-Agent': 'RankAutonomous/1.0',
        'Accept': 'application/json, text/html, */*',
        ...customHeaders,
      };

      const fetchInit: RequestInit = {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: requestHeaders,
      };

      if (body && method !== 'GET' && method !== 'HEAD') {
        fetchInit.body = body;
      }

      // Fetch with manual redirect to validate next hop safely
      const response = await fetch(currentUrl, fetchInit);

      clearTimeout(timeoutId);

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect with no location header');
        }
        // Resolve relative URL
        currentUrl = new URL(location, currentUrl).href;
        redirects++;
        continue;
      }

      return response;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw fetchError;
    }
  }

  throw new Error(`Too many redirects (max ${maxRedirects})`);
}
