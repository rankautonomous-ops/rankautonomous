import { AnalysisCategory, CategoryResult } from './types';

export const CATEGORY_WEIGHTS: Record<AnalysisCategory, number> = {
  'Technical SEO': 20,
  'Performance': 15,
  'Security & HTTPS': 15,
  'Metadata & Content Structure': 15,
  'Images & Accessibility': 10,
  'Social Sharing': 10,
  'Structured Data': 5,
  'Indexability & Crawling': 10
};

/**
 * Calculates a deterministic, weighted overall score (0-100)
 * from evaluated category results.
 */
export function calculateWebsiteOverallScore(categories: CategoryResult[]): number {
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const cat of categories) {
    if (cat.score < 0) continue; // Skip unevaluated categories

    const weight = CATEGORY_WEIGHTS[cat.category] || 10;
    totalWeight += weight;
    earnedWeight += (cat.score / 100) * weight;
  }

  if (totalWeight === 0) return 0;

  return Math.round((earnedWeight / totalWeight) * 100);
}
