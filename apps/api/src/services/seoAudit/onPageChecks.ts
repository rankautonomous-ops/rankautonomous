import { AuditContext, SeoCheckResult, SeoCheckIssue } from './types';

export function runOnPageChecks(ctx: AuditContext): SeoCheckResult {
  let score = 100;
  const issues: SeoCheckIssue[] = [];
  const category = 'On-Page SEO';

  const titleMap = new Map<string, string[]>();
  const descMap = new Map<string, string[]>();

  for (const p of ctx.pages) {
    if (p.status !== 'SUCCESS') continue;

    // 1. Missing or Short Title
    if (!p.title || p.title.trim() === '') {
      score -= 10;
      issues.push({
        title: 'Missing Title Tag',
        description: 'The page has no title tag.',
        category,
        priority: 'HIGH',
        affectedUrl: p.url,
        recommendation: 'Add a unique descriptive title between 30-60 characters.'
      });
    } else if (p.title.length < 30 || p.title.length > 60) {
      score -= 5;
      issues.push({
        title: 'Suboptimal Title Length',
        description: `Title length is ${p.title.length} characters. Optimal is 30-60.`,
        category,
        priority: 'LOW',
        affectedUrl: p.url,
        recommendation: 'Adjust the title tag length to be between 30 and 60 characters.'
      });
    }

    if (p.title) {
      const t = p.title.toLowerCase().trim();
      if (!titleMap.has(t)) titleMap.set(t, []);
      titleMap.get(t)!.push(p.url);
    }

    // 2. Missing or Short Meta Description
    if (!p.description || p.description.trim() === '') {
      score -= 10;
      issues.push({
        title: 'Missing Meta Description',
        description: 'The page has no meta description.',
        category,
        priority: 'HIGH',
        affectedUrl: p.url,
        recommendation: 'Add a meta description that accurately summarizes the page (70-155 characters).'
      });
    } else if (p.description.length < 70 || p.description.length > 155) {
      score -= 5;
      issues.push({
        title: 'Suboptimal Meta Description Length',
        description: `Description length is ${p.description.length} characters. Optimal is 70-155.`,
        category,
        priority: 'LOW',
        affectedUrl: p.url,
        recommendation: 'Adjust the meta description to be between 70 and 155 characters.'
      });
    }

    if (p.description) {
      const d = p.description.toLowerCase().trim();
      if (!descMap.has(d)) descMap.set(d, []);
      descMap.get(d)!.push(p.url);
    }

    // 3. Missing H1
    if (!p.h1 || p.h1.trim() === '') {
      score -= 10;
      issues.push({
        title: 'Missing H1 Tag',
        description: 'The page is missing an H1 heading.',
        category,
        priority: 'HIGH',
        affectedUrl: p.url,
        recommendation: 'Add exactly one primary H1 that describes the page topic.'
      });
    }
  }

  // Duplicate Titles
  for (const [title, urls] of titleMap.entries()) {
    if (urls.length > 1) {
      score -= (urls.length * 2);
      issues.push({
        title: 'Duplicate Title Tags',
        description: `The title "${title}" is used on ${urls.length} pages.`,
        category,
        priority: 'MEDIUM',
        affectedUrl: urls[0],
        recommendation: 'Ensure every page has a unique, descriptive title tag.'
      });
    }
  }

  // Duplicate Meta Descriptions
  for (const [desc, urls] of descMap.entries()) {
    if (urls.length > 1) {
      score -= (urls.length * 2);
      issues.push({
        title: 'Duplicate Meta Descriptions',
        description: `A meta description is duplicated across ${urls.length} pages.`,
        category,
        priority: 'MEDIUM',
        affectedUrl: urls[0],
        recommendation: 'Ensure every page has a unique meta description.'
      });
    }
  }

  return { category, score: Math.max(0, score), issues };
}
