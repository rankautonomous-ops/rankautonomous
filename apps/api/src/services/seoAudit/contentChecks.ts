import { AuditContext, SeoCheckResult, SeoCheckIssue } from './types';

export function runContentChecks(ctx: AuditContext): SeoCheckResult {
  let score = 100;
  const issues: SeoCheckIssue[] = [];
  const category = 'Content Quality';

  for (const p of ctx.pages) {
    if (p.status !== 'SUCCESS') continue;

    // Thin content check
    if (p.wordCount !== null && p.wordCount < 300) {
      score -= 10;
      issues.push({
        title: 'Thin Content',
        description: `Page has only ${p.wordCount} words.`,
        category,
        priority: 'MEDIUM',
        affectedUrl: p.url,
        recommendation: 'Expand the content on this page to provide more value to users and search engines (aim for >300 words).'
      });
    }
  }

  return { category, score: Math.max(0, score), issues };
}
