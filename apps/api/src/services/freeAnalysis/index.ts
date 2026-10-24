import { normalizeUrl } from '../../lib/urlNormalizer';
import { fetchWebsiteAnalysis, checkRobotsTxtSafely } from './httpFetcher';
import { runAllWebsiteChecks } from './checks';
import { calculateWebsiteOverallScore } from './scoring';
import {
  WebsiteAnalysisResult,
  AnalysisFinding,
  AnalysisCategory
} from './types';

export * from './types';
export * from './httpFetcher';
export * from './checks';
export * from './scoring';

/**
 * Deduplicates findings that share the same ID or title
 */
function deduplicateFindings(findings: AnalysisFinding[]): AnalysisFinding[] {
  const seen = new Set<string>();
  const unique: AnalysisFinding[] = [];

  for (const f of findings) {
    const key = `${f.category}:${f.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  return unique;
}

export async function runFreeAnalysis(targetUrl: string): Promise<WebsiteAnalysisResult> {
  const normalized = normalizeUrl(targetUrl);
  if (!normalized) {
    throw new Error('Invalid URL provided.');
  }

  // 1. Fetch website safely with monotonic timings, SSL inspection & SSRF controls
  const httpResponse = await fetchWebsiteAnalysis(normalized);

  // 2. Safely check robots.txt availability
  const robotsTxt = await checkRobotsTxtSafely(httpResponse.finalUrl);

  // 3. Run all evidence-based technical checks across 8 categories
  const { categories, metadata } = runAllWebsiteChecks({
    http: httpResponse,
    robotsTxt
  });

  // 4. Calculate deterministic weighted overall score
  const overallScore = calculateWebsiteOverallScore(categories);

  // 5. Aggregate all findings
  const allFindings = categories.flatMap(c => c.findings);
  const priorityWeight: Record<string, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1
  };

  const sortedFindings = deduplicateFindings(allFindings).sort((a, b) => {
    const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    return a.title.localeCompare(b.title);
  });

  // Top issues for quick summary consumption (top 6 issues)
  const topIssues = sortedFindings.slice(0, 6);

  // Summary counts
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let skippedChecks = 0;

  const categoriesMap: Record<string, any> = {};

  for (const cat of categories) {
    totalChecks += cat.checksPerformed;
    passedChecks += cat.checksPassed;
    failedChecks += cat.checksFailed;
    skippedChecks += cat.checksSkipped;

    categoriesMap[cat.category] = {
      score: cat.score,
      checksPerformed: cat.checksPerformed,
      checksPassed: cat.checksPassed,
      checksFailed: cat.checksFailed,
      checks: cat.checks
    };
  }

  const categoryScores = categories.map(c => ({
    category: c.category,
    score: c.score,
    checksPerformed: c.checksPerformed,
    checksPassed: c.checksPassed,
    checksFailed: c.checksFailed,
    checksSkipped: c.checksSkipped
  }));

  const limitations = [
    'HTTP timings represent server-side fetch latency approximations and do not substitute for real-user or lab Core Web Vitals (LCP, INP, CLS).',
    'SSL/TLS validation evaluates certificate chain and validity periods; client-specific trust stores may vary.',
    'HTML structure checks reflect the static initial response; client-side single-page apps (SPAs) may inject additional markup after hydration.',
    'Search engine indexing is determined by complex proprietary ranking algorithms; HTML directives provide guidance but do not guarantee indexation.'
  ];

  return {
    url: normalized,
    finalUrl: httpResponse.finalUrl,
    overallScore,
    pagesAnalyzed: 1,
    testedAt: new Date().toISOString(),
    summary: {
      totalChecks,
      passedChecks,
      failedChecks,
      skippedChecks
    },
    timings: {
      ttfbMs: httpResponse.timings.ttfbMs,
      downloadMs: httpResponse.timings.downloadMs,
      totalDurationMs: httpResponse.timings.totalMs,
      notes: 'Monotonic server-side measurement. TTFB measures request dispatch to first byte of response headers.'
    },
    http: {
      statusCode: httpResponse.statusCode,
      statusMessage: httpResponse.statusText,
      redirectCount: httpResponse.redirectCount,
      redirectChain: httpResponse.redirectChain,
      contentType: httpResponse.contentType,
      contentEncoding: httpResponse.contentEncoding,
      htmlSizeBytes: httpResponse.htmlSizeBytes
    },
    security: {
      isHttps: httpResponse.isHttps,
      tlsVersion: httpResponse.tls?.protocol || (httpResponse.isHttps ? 'TLS' : null),
      certificate: httpResponse.tls
        ? {
            issuer: httpResponse.tls.issuer,
            validFrom: httpResponse.tls.validFrom,
            validTo: httpResponse.tls.validTo,
            daysRemaining: httpResponse.tls.daysRemaining,
            isValid: httpResponse.tls.authorized,
            error: httpResponse.tls.authorizationError
          }
        : null,
      headers: {
        'strict-transport-security': httpResponse.headers['strict-transport-security'] || null,
        'x-content-type-options': httpResponse.headers['x-content-type-options'] || null,
        'content-security-policy': httpResponse.headers['content-security-policy'] || null,
        'referrer-policy': httpResponse.headers['referrer-policy'] || null,
        'permissions-policy': httpResponse.headers['permissions-policy'] || null,
        'x-frame-options': httpResponse.headers['x-frame-options'] || null
      }
    },
    categoryScores,
    categories: categoriesMap as Record<AnalysisCategory, any>,
    findings: sortedFindings,
    topIssues,
    metadata,
    limitations
  };
}
