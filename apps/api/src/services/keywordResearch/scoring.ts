import { KeywordMetrics } from './types';
import { SearchIntent } from '@prisma/client';

export interface GscMetrics {
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
}

/**
 * Calculates the RankAutonomous Opportunity Score deterministically based on available evidence.
 * DO NOT claim this is a Google ranking score.
 * 
 * Logic:
 * 1. Intent Multiplier: Transactional/Commercial intents are more valuable.
 * 2. If 3rd-party metrics (volume/difficulty) exist:
 *    Score += (log(volume) / (difficulty + 1)) * weight
 * 3. If GSC metrics exist:
 *    Score += High impressions + low CTR (gap) + near page 1 position (11-20) are high opportunity.
 * 
 * Returns a score 0-100.
 */
export function calculateOpportunityScore(
  metrics: KeywordMetrics | null,
  intent: SearchIntent | null,
  gsc: GscMetrics | null = null,
  relevance: number = 5
): number | null {
  // If we have literally no data, return null
  if (!metrics?.searchVolume && !gsc?.impressions) {
    return null;
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

  let baseScore = 0;

  // 1. Third-party metric score (if available)
  if (metrics?.searchVolume && metrics?.searchVolume > 0 && metrics?.keywordDifficulty) {
    const logVolume = Math.log10(metrics.searchVolume);
    const difficultyFactor = metrics.keywordDifficulty + 1;
    // max ~15
    baseScore += (logVolume * 5) / (difficultyFactor / 10); 
  }

  // 2. GSC Data score (if available)
  if (gsc && gsc.impressions > 0) {
    const logImp = Math.log10(gsc.impressions);
    
    // CTR Gap: if CTR is low but impressions are high, that's an opportunity
    const ctrGap = Math.max(0, 0.3 - gsc.ctr); // assuming 30% is a great CTR
    
    // Position modifier: position 11-20 (striking distance) is high opportunity.
    let posMod = 1.0;
    if (gsc.position > 10 && gsc.position <= 20) posMod = 1.5;
    else if (gsc.position > 20 && gsc.position <= 50) posMod = 1.2;
    else if (gsc.position > 1 && gsc.position <= 10) posMod = 0.8; // Already ranking well

    // max ~20
    baseScore += (logImp * 3) * (1 + ctrGap) * posMod;
  }

  // Combine and apply intent multiplier and relevance
  const rawScore = baseScore * multiplier * (relevance / 5);

  const normalizedScore = Math.min(100, Math.max(0, Math.round(rawScore * 2)));

  return normalizedScore;
}
