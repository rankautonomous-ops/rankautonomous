import { RecommendationPriority } from '@prisma/client';
import { CandidateRecommendation } from './types';

export function calculateScoreAndPriority(candidate: CandidateRecommendation): { score: number, priority: RecommendationPriority, impact: number, effort: number, confidence: number } {
  // We assume raw inputs are generally on a 1-100 scale, but could be adjusted.
  // Formula: Impact * Confidence * Opportunity / Effort (or simpler: Impact + Confidence + Opportunity - Effort)
  // Let's use the additive one with weights to avoid division by zero or extreme scaling.
  // Let's normalize effort to be a penalty.
  
  // Weights:
  // Impact: 40%
  // Opportunity: 30%
  // Confidence: 30%
  // Effort: subtract up to 30%
  
  const rawImpact = Math.min(Math.max(candidate.rawImpact, 0), 100);
  const rawOpportunity = Math.min(Math.max(candidate.rawOpportunity, 0), 100);
  const rawConfidence = Math.min(Math.max(candidate.rawConfidence, 0), 100);
  const rawEffort = Math.min(Math.max(candidate.rawEffort, 1), 100); // 1-100

  // Calculate base score out of 100 based on positive factors
  const baseScore = (rawImpact * 0.4) + (rawOpportunity * 0.3) + (rawConfidence * 0.3);
  
  // Effort penalty (higher effort reduces the score)
  // If effort is 100, we subtract a large amount (e.g., 30 points)
  // If effort is 0, we subtract 0 points
  const effortPenalty = (rawEffort / 100) * 30;
  
  let finalScore = Math.round(baseScore - effortPenalty);
  
  // Ensure within bounds
  finalScore = Math.max(0, Math.min(100, finalScore));

  let priority: RecommendationPriority = RecommendationPriority.LOW;
  if (finalScore >= 80) {
    priority = RecommendationPriority.CRITICAL;
  } else if (finalScore >= 60) {
    priority = RecommendationPriority.HIGH;
  } else if (finalScore >= 40) {
    priority = RecommendationPriority.MEDIUM;
  }

  return {
    score: finalScore,
    priority,
    impact: rawImpact,
    effort: rawEffort,
    confidence: rawConfidence
  };
}
