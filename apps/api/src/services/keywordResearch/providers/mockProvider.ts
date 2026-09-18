import { IKeywordResearchProvider, KeywordMetrics } from '../types';

/**
 * MOCK PROVIDER
 * This must ONLY be used for tests. It simulates a successful API call.
 */
export class MockKeywordProvider implements IKeywordResearchProvider {
  async enrichKeywords(keywords: string[]): Promise<Record<string, KeywordMetrics>> {
    const results: Record<string, KeywordMetrics> = {};
    for (const kw of keywords) {
      // Deterministic fake data based on length for tests
      results[kw] = {
        searchVolume: kw.length * 100,
        keywordDifficulty: Math.min(100, kw.length * 5),
        currentRanking: kw.length % 2 === 0 ? kw.length : null,
        targetUrl: kw.length % 2 === 0 ? 'https://example.com/target' : null
      };
    }
    return results;
  }
}
