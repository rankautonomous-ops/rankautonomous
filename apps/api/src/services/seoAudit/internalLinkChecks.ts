import { AuditContext, SeoCheckResult, SeoCheckIssue } from './types';

export function runInternalLinkChecks(ctx: AuditContext): SeoCheckResult {
  let score = 100;
  const issues: SeoCheckIssue[] = [];
  const category = 'Internal Linking';

  // To find orphans, we need to build an incoming link map
  const incomingLinks = new Map<string, number>();
  
  // Initialize map for all successful pages
  for (const p of ctx.pages) {
    if (p.status === 'SUCCESS') {
      incomingLinks.set(p.url, 0);
    }
  }

  // Count incoming links from crawled pages
  for (const p of ctx.pages) {
    if (p.status === 'SUCCESS' && Array.isArray(p.internalLinks)) {
      for (const link of p.internalLinks) {
        if (incomingLinks.has(link)) {
          incomingLinks.set(link, incomingLinks.get(link)! + 1);
        }
      }
    }
  }

  // Evaluate
  for (const p of ctx.pages) {
    if (p.status !== 'SUCCESS') continue;

    const inCount = incomingLinks.get(p.url) || 0;
    
    // Ignore depth 0 (homepage) as it's the root
    if (inCount === 0 && p.depth > 0) {
      score -= 15;
      issues.push({
        title: 'Orphan Page Candidate',
        description: 'Page has zero incoming internal links from crawled pages.',
        category,
        priority: 'HIGH',
        affectedUrl: p.url,
        recommendation: 'Add internal links pointing to this page from relevant content on your site.'
      });
    } else if (inCount < 3 && p.depth > 0) {
      score -= 5;
      issues.push({
        title: 'Low Incoming Internal Links',
        description: `Page has only ${inCount} incoming internal link(s).`,
        category,
        priority: 'LOW',
        affectedUrl: p.url,
        recommendation: 'Add more internal links to this page to improve its authority and discoverability.'
      });
    }
  }

  return { category, score: Math.max(0, score), issues };
}
