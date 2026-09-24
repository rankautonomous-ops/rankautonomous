import {
  RecommendationCategory,
  RecommendationPriority,
  RecommendationActionType,
  AutomationType
} from '@prisma/client';

export interface CandidateRecommendation {
  websiteId: string;
  type: RecommendationActionType;
  category: RecommendationCategory;
  title: string;
  description: string;
  sourceType: string;
  sourceId?: string;
  targetUrl?: string;
  targetKeyword?: string;
  suggestedAction?: string;
  automationType: AutomationType;
  
  // Base raw scores used to calculate the final normalised score
  rawImpact: number;
  rawEffort: number;
  rawConfidence: number;
  rawOpportunity: number;
  
  deduplicationKey: string;
  metadata?: any;
}
