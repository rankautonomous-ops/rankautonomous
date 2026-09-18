import { Keyword, SearchIntent, KeywordSource, KeywordStatus } from '@prisma/client';

export interface KeywordMetrics {
  searchVolume: number | null;
  keywordDifficulty: number | null;
  currentRanking: number | null;
  targetUrl: string | null;
}

export interface IKeywordResearchProvider {
  /**
   * Enrich a list of keywords with metrics from an external source.
   */
  enrichKeywords(keywords: string[]): Promise<Record<string, KeywordMetrics>>;
}

export interface KeywordCreationDto {
  keyword: string;
  intent?: SearchIntent | null;
  targetUrl?: string | null;
  source?: KeywordSource | null;
}
