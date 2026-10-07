import { normalizeUrl } from '../../lib/urlNormalizer';
import { ssrfSafeFetch } from '../../lib/urlSafety';
import * as cheerio from 'cheerio';
import { runTechnicalChecks } from '../seoAudit/technicalChecks';
import { runOnPageChecks } from '../seoAudit/onPageChecks';
import { runContentChecks } from '../seoAudit/contentChecks';
import { runPerformanceChecks } from '../seoAudit/performanceChecks';
import { calculateOverallScore } from '../seoAudit/scoring';
import { AuditContext, SeoCheckResult } from '../seoAudit/types';

export async function runFreeAnalysis(targetUrl: string) {
  const normalized = normalizeUrl(targetUrl);
  if (!normalized) {
    throw new Error('Invalid URL provided.');
  }

  // 1. Fetch the page securely
  let statusCode: number | null = null;
  let html = '';
  let htmlSize = 0;
  
  try {
    const res = await ssrfSafeFetch(normalized, 3, 10000); // Max 3 redirects, 10s timeout
    statusCode = res.status;

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error('The target URL is not an HTML page.');
    }
    
    html = await res.text();
    htmlSize = Buffer.byteLength(html, 'utf8');

    // Max 3MB for free analysis
    if (htmlSize > 3 * 1024 * 1024) {
      throw new Error('Page is too large to analyze.');
    }
  } catch (err: any) {
    throw new Error(`Failed to crawl website: ${err.message || 'Unknown error'}`);
  }

  // 2. Parse content
  const $ = cheerio.load(html);
  const title = $('title').text().trim() || null;
  const description = $('meta[name="description"]').attr('content')?.trim() || null;
  const h1 = $('h1').first().text().trim() || null;
  
  let canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
  if (canonicalUrl) {
    canonicalUrl = normalizeUrl(canonicalUrl, normalized) || canonicalUrl;
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(' ').length : 0;

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  const parsedStart = new URL(normalized);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        const cleanLink = normalizeUrl(href, normalized);
        if (!cleanLink) return;
        
        const linkUrl = new URL(cleanLink);
        if (linkUrl.hostname === parsedStart.hostname) {
          if (!internalLinks.includes(cleanLink)) {
            internalLinks.push(cleanLink);
          }
        } else {
          if (!externalLinks.includes(cleanLink)) {
            externalLinks.push(cleanLink);
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  });

  // 3. Construct Mock PageResult and Context
  const mockPage = {
    id: 'mock-page',
    crawlJobId: 'mock-job',
    url: normalized,
    normalizedUrl: normalized,
    statusCode,
    status: 'SUCCESS',
    title,
    description,
    h1,
    wordCount,
    htmlSize,
    internalLinks,
    externalLinks,
    error: null,
    canonicalUrl,
    depth: 0,
    crawledAt: new Date()
  };

  const ctx: AuditContext = {
    websiteId: 'mock-website',
    crawlJobId: 'mock-job',
    pages: [mockPage]
  };

  // 4. Run Checks
  const results: SeoCheckResult[] = [
    runTechnicalChecks(ctx),
    runOnPageChecks(ctx),
    runContentChecks(ctx),
    runPerformanceChecks(ctx)
  ];

  const overallScore = calculateOverallScore(results);
  
  const allIssues = results.flatMap(r => r.issues);
  
  // Sort issues by priority
  const priorityWeight: Record<string, number> = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
  allIssues.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
  
  // Limit to top 3 issues for the free report
  const topIssues = allIssues.slice(0, 3);

  return {
    url: normalized,
    overallScore,
    categoryScores: results.map(r => ({
      category: r.category,
      score: r.score
    })),
    pagesAnalyzed: 1,
    topIssues
  };
}
