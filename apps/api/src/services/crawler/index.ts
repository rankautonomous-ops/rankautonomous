import prisma from '../../lib/database';
import { ssrfSafeFetch } from '../../lib/urlSafety';
import { normalizeUrl } from '../../lib/urlNormalizer';
import * as cheerio from 'cheerio';
// @ts-ignore
import robotsParser from 'robots-parser';

export const CRAWL_CONFIG = {
  MAX_PAGES: 50,
  MAX_DEPTH: 3,
  REQUEST_TIMEOUT_MS: 10000,
  MAX_REDIRECTS: 5,
  MAX_PAYLOAD_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  MAX_SITEMAP_URLS: 1000
};

function isStaticAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    const ext = parsed.pathname.split('.').pop()?.toLowerCase();
    const staticExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'css', 'js', 'mp4', 'mp3', 'wav', 'pdf', 'zip', 'rar', 'woff', 'woff2', 'ttf', 'eot', 'exe', 'dmg'];
    return staticExts.includes(ext || '');
  } catch {
    return false;
  }
}

interface QueueItem {
  url: string;
  depth: number;
}

export async function startCrawl(websiteId: string, crawlJobId: string, startUrl: string): Promise<void> {
  let crawledUrls = 0;
  let failedUrls = 0;
  const visited = new Set<string>();
  const queue: QueueItem[] = [];
  let baseNormalized = startUrl;
  let rootErrorStr: string | null = null;

  try {
    const normalized = normalizeUrl(startUrl);
    if (!normalized) {
      throw new Error('Invalid start URL');
    }
    baseNormalized = normalized;
    const parsedStart = new URL(baseNormalized);

    queue.push({ url: baseNormalized, depth: 0 });
    visited.add(baseNormalized);

    // 1. Setup Status
    await prisma.crawlJob.update({
      where: { id: crawlJobId },
      data: { status: 'CRAWLING', startedAt: new Date(), totalUrls: 1 },
    });

    await prisma.website.update({
      where: { id: websiteId },
      data: { status: 'ANALYZING' },
    });

    // 2. Fetch robots.txt safely and process Sitemaps
    let robots: any = null;
    let sitemapUrls: string[] = [];
    try {
      const robotsUrl = `${parsedStart.origin}/robots.txt`;
      const robotsRes = await ssrfSafeFetch(robotsUrl, 1, 5000);
      if (robotsRes.ok) {
        const robotsTxt = await robotsRes.text();
        robots = robotsParser(robotsUrl, robotsTxt);
        const sitemaps = robots.getSitemaps();
        if (sitemaps && sitemaps.length > 0) {
          sitemapUrls = sitemaps;
        } else {
          // Default fallback
          sitemapUrls = [`${parsedStart.origin}/sitemap.xml`];
        }
      } else {
        sitemapUrls = [`${parsedStart.origin}/sitemap.xml`];
      }
    } catch (e) {
      console.log(`[Crawler] Could not fetch robots.txt for ${startUrl}:`, (e as any).message);
      sitemapUrls = [`${parsedStart.origin}/sitemap.xml`];
    }

    // Process Sitemaps
    for (const sUrl of sitemapUrls) {
      try {
        const smRes = await ssrfSafeFetch(sUrl, 1, 5000);
        if (smRes.ok) {
          const contentType = smRes.headers.get('content-type') || '';
          if (contentType.includes('xml')) {
            const smXml = await smRes.text();
            // Simple regex to extract <loc> URLs
            const locRegex = /<loc>(.*?)<\/loc>/g;
            let match;
            let count = 0;
            while ((match = locRegex.exec(smXml)) !== null && count < CRAWL_CONFIG.MAX_SITEMAP_URLS) {
              const extracted = normalizeUrl(match[1]);
              if (extracted) {
                const parsedExt = new URL(extracted);
                if (parsedExt.hostname === parsedStart.hostname) {
                  if (!visited.has(extracted)) {
                    visited.add(extracted);
                    queue.push({ url: extracted, depth: 1 });
                    count++;
                  }
                }
              }
            }
          }
        }
      } catch (smErr) {
        // Silently ignore sitemap errors
      }
    }

    // 3. Process Queue
    while (queue.length > 0 && crawledUrls < CRAWL_CONFIG.MAX_PAGES) {
      // Check cancellation every iteration
      const jobCheck = await prisma.crawlJob.findUnique({
        where: { id: crawlJobId },
        select: { status: true }
      });

      if (jobCheck?.status === 'CANCELLED') {
        console.log(`[Crawler] Job ${crawlJobId} cancelled by user.`);
        break; // Stop processing
      }

      const { url: currentUrl, depth } = queue.shift()!;

      // Check robots.txt (we already marked visited)
      if (robots && !robots.isAllowed(currentUrl, 'RankAutonomousCrawler/1.0')) {
        continue; // Note: counts towards totalUrls, but not crawledUrls
      }

      let statusCode: number | null = null;
      let errorStr: string | null = null;
      let title: string | null = null;
      let description: string | null = null;
      let h1: string | null = null;
      let wordCount: number | null = null;
      let htmlSize: number | null = null;
      let canonicalUrl: string | null = null;
      const internalLinks: string[] = [];
      const externalLinks: string[] = [];
      let pageStatus = 'SUCCESS';

      try {
        const res = await ssrfSafeFetch(currentUrl, CRAWL_CONFIG.MAX_REDIRECTS, CRAWL_CONFIG.REQUEST_TIMEOUT_MS);
        statusCode = res.status;

        if (!res.ok) {
           throw new Error(`HTTP Error ${res.status}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
          throw new Error('Not an HTML page');
        }

        const contentLength = res.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > CRAWL_CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
           throw new Error(`Payload exceeds maximum size of ${CRAWL_CONFIG.MAX_PAYLOAD_SIZE_BYTES} bytes`);
        }

        const html = await res.text();
        htmlSize = Buffer.byteLength(html, 'utf8');

        if (htmlSize > CRAWL_CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
           throw new Error(`Payload exceeds maximum size of ${CRAWL_CONFIG.MAX_PAYLOAD_SIZE_BYTES} bytes`);
        }

        const $ = cheerio.load(html);
        title = $('title').text().trim() || null;
        description = $('meta[name="description"]').attr('content')?.trim() || null;
        h1 = $('h1').first().text().trim() || null;
        
        canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
        if (canonicalUrl) {
          canonicalUrl = normalizeUrl(canonicalUrl, currentUrl) || canonicalUrl;
        }

        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        wordCount = bodyText ? bodyText.split(' ').length : 0;
        
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            try {
              if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

              const cleanLink = normalizeUrl(href, currentUrl);
              if (!cleanLink) return;

              if (isStaticAsset(cleanLink)) return;
              
              const linkUrl = new URL(cleanLink);

              if (linkUrl.hostname === parsedStart.hostname) {
                if (!internalLinks.includes(cleanLink)) {
                  internalLinks.push(cleanLink);
                }
                if (!visited.has(cleanLink) && depth < CRAWL_CONFIG.MAX_DEPTH) {
                  visited.add(cleanLink);
                  queue.push({ url: cleanLink, depth: depth + 1 });
                }
              } else {
                if (!externalLinks.includes(cleanLink)) {
                  externalLinks.push(cleanLink);
                }
              }
            } catch (e) {
              // Ignore invalid URLs
            }
          }
        });
      } catch (err: any) {
        errorStr = err.message || 'Unknown error during fetch/parse';
        pageStatus = 'FAILED';
        if (depth === 0) {
          rootErrorStr = errorStr;
        }
      }

      // 4. Save PageResult
      try {
        await prisma.pageResult.upsert({
          where: {
            crawlJobId_url: {
              crawlJobId,
              url: currentUrl,
            }
          },
          update: {
            statusCode,
            status: pageStatus,
            title,
            description,
            h1,
            wordCount,
            htmlSize,
            internalLinks,
            externalLinks,
            error: errorStr,
            canonicalUrl,
            depth,
            crawledAt: new Date()
          },
          create: {
            crawlJobId,
            url: currentUrl,
            normalizedUrl: currentUrl,
            statusCode,
            status: pageStatus,
            title,
            description,
            h1,
            wordCount,
            htmlSize,
            internalLinks,
            externalLinks,
            error: errorStr,
            canonicalUrl,
            depth,
          }
        });
        if (pageStatus === 'FAILED') {
          failedUrls++;
        } else {
          crawledUrls++;
        }

        // Update Job progress
        await prisma.crawlJob.update({
          where: { id: crawlJobId },
          data: {
            crawledUrls,
            failedUrls,
            totalUrls: visited.size, // Size of all discovered/queued/crawled
          }
        });
      } catch (dbErr) {
        console.error(`[Crawler] Failed to save PageResult for ${currentUrl}`, dbErr);
      }
    }

    // Check if the loop exited because of cancellation
    const finalJob = await prisma.crawlJob.findUnique({
      where: { id: crawlJobId },
      select: { status: true }
    });

    if (finalJob?.status === 'CANCELLED') {
      await prisma.website.update({
        where: { id: websiteId },
        data: { status: 'CONNECTED' }, // Revert to connected
      });
      return;
    }

    // 5. Complete
    if (crawledUrls === 0 && failedUrls > 0) {
      throw new Error(rootErrorStr || 'All pages failed to crawl.');
    }

    await prisma.crawlJob.update({
      where: { id: crawlJobId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await prisma.website.update({
      where: { id: websiteId },
      data: { status: 'ACTIVE' },
    });

  } catch (globalErr: any) {
    console.error(`[Crawler] Job ${crawlJobId} failed:`, globalErr);
    
    const effectiveFailed = failedUrls > 0 ? failedUrls : (crawledUrls === 0 ? 1 : 0);
    const effectiveTotal = Math.max(visited.size, 1);

    await prisma.crawlJob.update({
      where: { id: crawlJobId },
      data: { 
        status: 'FAILED', 
        completedAt: new Date(),
        errorMessage: globalErr.message || 'Unknown crawl error',
        failedUrls: effectiveFailed,
        totalUrls: effectiveTotal,
        crawledUrls,
      },
    });

    // Also persist a FAILED PageResult for the root URL if none was recorded
    try {
      if (baseNormalized) {
        await prisma.pageResult.upsert({
          where: {
            crawlJobId_url: {
              crawlJobId,
              url: baseNormalized,
            },
          },
          update: {
            status: 'FAILED',
            error: rootErrorStr || globalErr.message || 'Crawl failed',
            crawledAt: new Date(),
          },
          create: {
            crawlJobId,
            url: baseNormalized,
            normalizedUrl: baseNormalized,
            status: 'FAILED',
            error: rootErrorStr || globalErr.message || 'Crawl failed',
            depth: 0,
          },
        });
      }
    } catch {
      // Ignore secondary error on fallback pageResult
    }

    await prisma.website.update({
      where: { id: websiteId },
      data: { status: 'ERROR' }, 
    });
  }
}
