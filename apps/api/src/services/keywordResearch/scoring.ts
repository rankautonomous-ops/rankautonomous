import { KeywordMetrics } from './types';
import { SearchIntent } from '@prisma/client';

/**
 * Calculates the Opportunity Score deterministically.
 *
 * Formula:
 * - Requires searchVolume > 0 and keywordDifficulty to be available.
 * - Score = (log(searchVolume) * IntentMultiplier) / (keywordDifficulty + 1)
 *   normalized to a 0-100 scale.
 *
 * Intent Multipliers:
 * - TRANSACTIONAL: 1.5
 * - COMMERCIAL: 1.2
 * - INFORMATIONAL: 1.0
 * - NAVIGATIONAL: 0.8
 *
 * If data is unavailable, returns null.
 */
export function calculateOpportunityScore(
  metrics: KeywordMetrics,
  intent: SearchIntent | null
): number | null {
  if (metrics.searchVolume == null || metrics.keywordDifficulty == null) {
    return null;
  }

  if (metrics.searchVolume <= 0) {
    return 0;
  }

  let multiplier = 1.0;
  switch (intent) {
    case 'TRANSACTIONAL':
      multiplier = 1.5;
      break;
    case 'COMMERCIAL':
      multiplier = 1.2;
      break;
    case 'INFORMATIONAL':
      multiplier = 1.0;
      break;
    case 'NAVIGATIONAL':
      multiplier = 0.8;
      break;
  }

  const logVolume = Math.log10(metrics.searchVolume);
  const difficultyFactor = metrics.keywordDifficulty + 1; // avoid division by zero

  // Raw score is roughly between 0 and 15 for normal volumes (e.g. log10(100,000) = 5 * 1.5 / 10 = 0.75)
  // We'll normalize it: max expected logVolume ~ 6, max multiplier ~ 1.5, min difficulty ~ 1.
  // We'll use a simple scaling function that caps at 100.
  const rawScore = (logVolume * multiplier) / difficultyFactor;
  
  // Magic constant 100 is for scaling. e.g. Volume 100k, KD 10, Trans = (5 * 1.5) / 11 = 0.68 * 147 = ~100
  const normalizedScore = Math.min(100, Math.max(0, Math.round(rawScore * 100)));

  return normalizedScore;
}
