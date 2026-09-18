import { AuditContext, SeoCheckResult, SeoCheckIssue } from './types';

export function runPerformanceChecks(ctx: AuditContext): SeoCheckResult {
  let score = 100;
  const issues: SeoCheckIssue[] = [];
  const category = 'Performance';
  
  let evaluated = false;

  for (const p of ctx.pages) {
    if (p.status !== 'SUCCESS') continue;

    // Check HTML Size
    if (p.htmlSize !== null) {
      evaluated = true;
      if (p.htmlSize > 2 * 1024 * 1024) { // > 2MB
        score -= 20;
        issues.push({
          title: 'Excessive HTML Document Size',
          description: `Page HTML size is ${(p.htmlSize / 1024 / 1024).toFixed(2)} MB.`,
          category,
          priority: 'MEDIUM',
          affectedUrl: p.url,
          recommendation: 'Reduce DOM complexity or inline resources causing HTML bloat.'
        });
      }
    }
  }

  if (!evaluated) {
    return { category, score: -1, issues: [] }; // NOT_EVALUATED
  }

  return { category, score: Math.max(0, score), issues };
}
