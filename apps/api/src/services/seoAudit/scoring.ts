import { SeoCheckResult } from './types';

export function calculateOverallScore(results: SeoCheckResult[]): number {
  let totalWeight = 0;
  let earnedWeight = 0;

  // Documented weighting strategy
  const weights: Record<string, number> = {
    'Technical SEO': 30,
    'On-Page SEO': 30,
    'Content Quality': 20,
    'Internal Linking': 15,
    'Performance': 5,
  };

  for (const res of results) {
    if (res.score === -1) continue; // NOT_EVALUATED

    const weight = weights[res.category] || 0;
    totalWeight += weight;
    earnedWeight += (res.score / 100) * weight;
  }

  if (totalWeight === 0) return 0;
  
  // Normalize if totalWeight != 100
  return Math.round((earnedWeight / totalWeight) * 100);
}
