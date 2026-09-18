import { AuditContext, SeoCheckResult, SeoCheckIssue } from './types';

export function runTechnicalChecks(ctx: AuditContext): SeoCheckResult {
  let score = 100;
  const issues: SeoCheckIssue[] = [];
  const category = 'Technical SEO';

  // 1. Broken Pages & Server Errors
  const brokenPages = ctx.pages.filter(p => p.statusCode && p.statusCode >= 400);
  if (brokenPages.length > 0) {
    score -= (brokenPages.length * 5); // 5 point penalty per broken page
    for (const p of brokenPages) {
      issues.push({
        title: `Broken Page (${p.statusCode})`,
        description: `The page returned a ${p.statusCode} error.`,
        category,
        priority: p.statusCode >= 500 ? 'CRITICAL' : 'HIGH',
        affectedUrl: p.url,
        recommendation: 'Review the page and fix the server error or broken link.'
      });
    }
  }

  // 2. HTTPS Check
  const insecurePages = ctx.pages.filter(p => p.url && p.url.startsWith('http://'));
  if (insecurePages.length > 0) {
    score -= 20;
    issues.push({
      title: 'Insecure URL detected',
      description: 'Found pages served over HTTP instead of HTTPS.',
      category,
      priority: 'HIGH',
      affectedUrl: insecurePages[0].url,
      recommendation: 'Ensure all pages are served securely over HTTPS.'
    });
  }

  // 3. Missing Canonical
  const missingCanonical = ctx.pages.filter(p => !p.canonicalUrl && p.status === 'SUCCESS');
  if (missingCanonical.length > 0) {
    score -= (missingCanonical.length * 2);
    for (const p of missingCanonical) {
      issues.push({
        title: 'Missing Canonical Tag',
        description: 'Page does not declare a canonical URL.',
        category,
        priority: 'MEDIUM',
        affectedUrl: p.url,
        recommendation: 'Add a <link rel="canonical" href="..."> tag to indicate the preferred URL.'
      });
    }
  }

  return { category, score: Math.max(0, score), issues };
}
