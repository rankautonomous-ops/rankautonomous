/**
 * urlNormalizer.ts
 *
 * Implements a conservative deterministic URL normalization policy for the RankAutonomous crawler.
 */

const UTM_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'ref',
  'source',
  'mc_cid',
  'mc_eid',
  '_ga'
]);

/**
 * Normalizes a URL and optionally resolves it against a base URL.
 * 
 * Policy:
 * - Resolves relative URLs (e.g. /about) against baseUrl.
 * - Normalizes hostname to lowercase.
 * - Removes URL fragments (#section).
 * - Removes trailing slash if path is not exactly '/'.
 * - Removes tracking parameters (UTMs, gclid, etc) to prevent excessive query combinations.
 * - Sorts query parameters to ensure deterministic URLs (/a?x=1&y=2 is same as /a?y=2&x=1).
 * - Preserves meaningful path and non-tracking query parameters.
 * - Returns null if the URL is malformed or uses an unsupported protocol (e.g. javascript:).
 */
export function normalizeUrl(url: string, baseUrl?: string): string | null {
  try {
    const parsed = baseUrl ? new URL(url, baseUrl) : new URL(url);

    // Reject unsupported protocols early
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Remove fragment
    parsed.hash = '';

    // Normalize hostname (URL constructor does this, but being explicit)
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove tracking query parameters and sort remaining parameters
    const params = new URLSearchParams(parsed.search);
    const keysToDelete: string[] = [];
    
    params.forEach((_, key) => {
      if (UTM_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => params.delete(key));
    
    // Sort parameters to ensure ?a=1&b=2 is identical to ?b=2&a=1
    params.sort();
    
    // Update the search string
    const searchString = params.toString();
    parsed.search = searchString ? `?${searchString}` : '';

    let normalized = parsed.href;

    // Remove trailing slash on path (but keep it if it's the root domain)
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    // Remove default ports if present (URL constructor usually does this)
    normalized = normalized.replace(/:80(?=\/|$)/, '').replace(/:443(?=\/|$)/, '');

    return normalized;
  } catch {
    return null; // Malformed URL
  }
}
