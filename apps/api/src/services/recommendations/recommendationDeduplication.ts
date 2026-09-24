import { CandidateRecommendation } from './types';

export function deduplicateRecommendations(candidates: CandidateRecommendation[]): CandidateRecommendation[] {
  const map = new Map<string, CandidateRecommendation>();

  for (const candidate of candidates) {
    const key = candidate.deduplicationKey;
    if (map.has(key)) {
      const existing = map.get(key)!;
      // Merge logic: Combine impact/opportunity scores by taking max
      existing.rawImpact = Math.max(existing.rawImpact, candidate.rawImpact);
      existing.rawOpportunity = Math.max(existing.rawOpportunity, candidate.rawOpportunity);
      existing.rawConfidence = Math.max(existing.rawConfidence, candidate.rawConfidence);
      
      // Combine description if possible or keep highest priority. We will keep the highest impact description.
      if (candidate.rawImpact > existing.rawImpact) {
        existing.description = candidate.description;
        existing.title = candidate.title;
        existing.sourceType = candidate.sourceType;
      }
      
      // Merge source IDs into metadata array if tracking multiple sources is desired
      if (!existing.metadata) existing.metadata = {};
      if (!existing.metadata.additionalSources) existing.metadata.additionalSources = [];
      existing.metadata.additionalSources.push({ type: candidate.sourceType, id: candidate.sourceId });
    } else {
      map.set(key, candidate);
    }
  }

  return Array.from(map.values());
}
