import prisma from '../../lib/database';
import { fetchSafely } from './backlinkFetcher';
import * as cheerio from 'cheerio';
import { URL } from 'url';

/**
 * Normalizes a URL for comparison.
 * - Converts to https protocol
 * - Removes hash fragment
 * - Strips trailing slashes
 * - Removes common tracking query parameters (utm_*)
 * - Converts to lowercase
 */
export function normalizeUrlForComparison(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    u.protocol = 'https:';
    u.hash = '';

    // Remove utm_ parameters
    const paramsToDelete: string[] = [];
    u.searchParams.forEach((value, key) => {
      if (key.toLowerCase().startsWith('utm_')) {
        paramsToDelete.push(key);
      }
    });
    paramsToDelete.forEach(key => u.searchParams.delete(key));

    let href = u.href;
    if (href.endsWith('/')) {
      href = href.slice(0, -1);
    }
    return href.toLowerCase();
  } catch {
    // Fallback to basic string normalization if it's not a parseable URL
    let fallback = urlStr.toLowerCase().replace(/^http:\/\//, 'https://');
    const hashIndex = fallback.indexOf('#');
    if (hashIndex !== -1) {
      fallback = fallback.substring(0, hashIndex);
    }
    if (fallback.endsWith('/')) {
      fallback = fallback.slice(0, -1);
    }
    return fallback;
  }
}

/**
 * Verifies a single backlink by fetching its source URL and searching for the target URL.
 * Designed to be executed asynchronously by a background worker.
 * 
 * @param backlinkId The ID of the Backlink record in Prisma
 */
export async function verifyBacklink(backlinkId: string): Promise<void> {
  const backlink = await prisma.backlink.findUnique({
    where: { id: backlinkId }
  });

  if (!backlink) {
    throw new Error(`Backlink ${backlinkId} not found`);
  }

  // 1. Execute safe fetch
  const result = await fetchSafely(backlink.sourceUrl);

  // 2. Handle Fetch Errors (SSRF, Timeouts, DNS, etc.)
  if (!result.success) {
    // Determine if transient or permanent
    const transientErrors = ['TIMEOUT', 'DNS_FAILURE', 'NETWORK_ERROR', 'TOO_MANY_REDIRECTS'];
    
    if (result.errorCode && transientErrors.includes(result.errorCode)) {
      // Throw to trigger exponential backoff / retry in queue
      throw new Error(`Transient fetch error: ${result.errorCode} - ${result.errorMessage}`);
    } else {
      // Permanent error (SSRF, ROBOTS, INVALID_URL, TOO_LARGE, UNSUPPORTED_PROTOCOL)
      await prisma.backlink.update({
        where: { id: backlinkId },
        data: {
          verificationStatus: 'ERROR',
          lastErrorMessage: result.errorMessage || 'Permanent fetch error',
          lastChecked: new Date()
        }
      });
      return;
    }
  }

  // 3. Handle HTTP Status Codes
  if (result.statusCode && result.statusCode >= 400) {
    const isTransientHttp = [429, 500, 502, 503, 504].includes(result.statusCode);
    if (isTransientHttp) {
      throw new Error(`Transient HTTP error: ${result.statusCode}`);
    } else if (result.statusCode === 404 || result.statusCode === 410) {
      // 404 or 410 means the page is permanently gone, thus the link is MISSING.
      await prisma.backlink.update({
        where: { id: backlinkId },
        data: {
          verificationStatus: 'MISSING',
          lastErrorMessage: null,
          lastChecked: new Date()
        }
      });
      return;
    } else {
      // Permanent HTTP error (403, 401, etc.)
      await prisma.backlink.update({
        where: { id: backlinkId },
        data: {
          verificationStatus: 'ERROR',
          lastErrorMessage: `HTTP Error ${result.statusCode}`,
          lastChecked: new Date()
        }
      });
      return;
    }
  }

  // 4. Validate Content-Type
  const contentType = result.contentType || '';
  if (!contentType.toLowerCase().includes('text/html')) {
    await prisma.backlink.update({
      where: { id: backlinkId },
      data: {
        verificationStatus: 'ERROR',
        lastErrorMessage: `Invalid Content-Type: ${contentType}`,
        lastChecked: new Date()
      }
    });
    return;
  }

  if (!result.body) {
    await prisma.backlink.update({
      where: { id: backlinkId },
      data: {
        verificationStatus: 'ERROR',
        lastErrorMessage: 'Empty response body',
        lastChecked: new Date()
      }
    });
    return;
  }

  // 5. Parse HTML and Search for Link
  const $ = cheerio.load(result.body);
  const normalizedTarget = normalizeUrlForComparison(backlink.targetUrl);
  
  let found = false;
  const linkAttributes = new Set<string>();

  // Optional: check meta robots
  let metaRobotsNofollow = false;
  $('meta[name="robots"]').each((_, el) => {
    const content = $(el).attr('content')?.toLowerCase() || '';
    if (content.includes('nofollow')) {
      metaRobotsNofollow = true;
    }
  });

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      // Resolve relative links against the final fetched URL
      const resolvedHref = new URL(href, result.finalUrl).href;
      const normalizedHref = normalizeUrlForComparison(resolvedHref);

      if (normalizedHref === normalizedTarget) {
        found = true;
        // Extract rel attributes
        const rel = $(el).attr('rel')?.toLowerCase() || '';
        const relParts = rel.split(/\s+/);
        
        if (relParts.includes('nofollow')) linkAttributes.add('NOFOLLOW');
        if (relParts.includes('sponsored')) linkAttributes.add('SPONSORED');
        if (relParts.includes('ugc')) linkAttributes.add('UGC');
      }
    } catch {
      // Ignore invalid hrefs
    }
  });

  // If the page itself is nofollow, document the distinction.
  if (found && metaRobotsNofollow) {
    linkAttributes.add('PAGE_META_NOFOLLOW');
  }

  // 6. Save results
  if (found) {
    await prisma.backlink.update({
      where: { id: backlinkId },
      data: {
        verificationStatus: 'VERIFIED',
        linkAttributes: Array.from(linkAttributes),
        lastErrorMessage: null,
        lastChecked: new Date()
      }
    });
  } else {
    await prisma.backlink.update({
      where: { id: backlinkId },
      data: {
        verificationStatus: 'MISSING',
        lastErrorMessage: null,
        lastChecked: new Date()
      }
    });
  }
}
