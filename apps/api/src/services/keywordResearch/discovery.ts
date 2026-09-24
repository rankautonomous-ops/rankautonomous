import prisma from '../../lib/database';
import { generateKeywordSuggestions, WebsiteKeywordContext, KeywordSuggestion } from '../aiKeywordService';
import { SearchIntent, KeywordSource } from '@prisma/client';
import { calculateOpportunityScore } from './scoring';
import { normalizeKeyword } from './normalization';

export interface DiscoveryInput {
  websiteId: string;
  seedKeywords: string[];
  topic?: string;
  location?: string;
}

export interface DiscoveredKeyword {
  keyword: string;
  normalizedKeyword: string;
  intent: SearchIntent | null;
  relevance: number; // 1-10
  opportunityScore: number | null;
  source: KeywordSource;
  
  // Real metrics
  gscImpressions?: number;
  gscClicks?: number;
  gscCtr?: number;
  gscPosition?: number;
}

export async function discoverKeywords(input: DiscoveryInput): Promise<DiscoveredKeyword[]> {
  const { websiteId, seedKeywords, topic, location } = input;

  const website = await prisma.website.findUnique({
    where: { id: websiteId },
    include: { keywords: true, competitors: true }
  });

  if (!website) {
    throw new Error('Website not found');
  }

  const existingKeywords = website.keywords.map(k => k.keyword);
  const discovered: Map<string, DiscoveredKeyword> = new Map();

  // 1. GSC Data Source
  // Fetch top performing queries not yet tracked
  const gscRecords = await prisma.searchPerformanceRecord.groupBy({
    by: ['query'],
    where: {
      websiteId,
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // last 30 days
    },
    _sum: { clicks: true, impressions: true },
    _avg: { position: true, ctr: true },
    having: {
      impressions: { _sum: { gt: 50 } } // Meaningful impressions
    }
  });

  for (const record of gscRecords) {
    const norm = normalizeKeyword(record.query);
    if (!norm || existingKeywords.includes(norm)) continue;
    
    // Check if it's related to seed keywords if provided
    if (seedKeywords.length > 0) {
      const isRelated = seedKeywords.some(seed => norm.includes(normalizeKeyword(seed) || ''));
      if (!isRelated) continue;
    }

    const impressions = record._sum.impressions || 0;
    const clicks = record._sum.clicks || 0;
    const position = record._avg.position || 0;
    const ctr = record._avg.ctr || 0;

    discovered.set(norm, {
      keyword: record.query,
      normalizedKeyword: norm,
      intent: null, // GSC doesn't provide intent
      relevance: 10, // Own data is highly relevant
      opportunityScore: calculateOpportunityScore({ searchVolume: impressions, keywordDifficulty: position, currentRanking: position, targetUrl: null }, null, { impressions, clicks, position, ctr }),
      source: KeywordSource.SEARCH_CONSOLE,
      gscImpressions: impressions,
      gscClicks: clicks,
      gscCtr: ctr,
      gscPosition: position
    });
  }

  // 2. Competitor Data Source
  // Extract keywords from analyzed competitors
  for (const comp of website.competitors) {
    if (comp.status === 'ANALYZED' && comp.analysisData) {
      const data = comp.analysisData as any;
      if (Array.isArray(data.keywordOpportunities)) {
        for (const opp of data.keywordOpportunities) {
          const norm = normalizeKeyword(opp.keyword);
          if (!norm || discovered.has(norm) || existingKeywords.includes(norm)) continue;
          
          if (seedKeywords.length > 0) {
            const isRelated = seedKeywords.some(seed => norm.includes(normalizeKeyword(seed) || ''));
            if (!isRelated) continue;
          }

          let intentEnum: SearchIntent | null = null;
          if (opp.intent && Object.values(SearchIntent).includes(opp.intent as SearchIntent)) {
            intentEnum = opp.intent as SearchIntent;
          }

          discovered.set(norm, {
            keyword: opp.keyword,
            normalizedKeyword: norm,
            intent: intentEnum,
            relevance: opp.relevance || 5,
            opportunityScore: calculateOpportunityScore({ searchVolume: null, keywordDifficulty: null, currentRanking: null, targetUrl: null }, intentEnum, null),
            source: 'COMPETITOR' as any // Use string directly if enum missing
          });
        }
      }
    }
  }

  // 3. AI Data Source
  // If we still need more or user explicitly asked for AI discovery via seeds/topic
  const aiContext: WebsiteKeywordContext = {
    websiteUrl: website.url,
    businessName: website.name,
    industry: website.industry,
    country: website.targetCountry,
    targetAudience: website.targetAudience,
    description: website.description,
    seoGoals: website.seoGoals,
    targetLocationType: website.targetLocationType,
    targetRegion: website.targetRegion,
    targetCity: website.targetCity,
    existingKeywords: [...existingKeywords, ...Array.from(discovered.keys()), ...seedKeywords]
  };

  // Only run AI if we want to complement
  if (seedKeywords.length > 0 || topic) {
    aiContext.description = `${aiContext.description || ''} Topic focus: ${topic || seedKeywords.join(', ')}. ${location ? `Location: ${location}.` : ''}`;
    try {
      const aiResults = await generateKeywordSuggestions(aiContext);
      for (const sugg of aiResults.suggestions) {
        const norm = normalizeKeyword(sugg.keyword);
        if (!norm || discovered.has(norm) || existingKeywords.includes(norm)) continue;

        let intentEnum: SearchIntent | null = null;
        if (sugg.intent) {
          const upper = sugg.intent.toUpperCase();
          if (Object.values(SearchIntent).includes(upper as SearchIntent)) {
            intentEnum = upper as SearchIntent;
          }
        }

        discovered.set(norm, {
          keyword: sugg.keyword,
          normalizedKeyword: norm,
          intent: intentEnum,
          relevance: 8, // AI suggestions are fairly relevant
          opportunityScore: calculateOpportunityScore({ searchVolume: null, keywordDifficulty: null, currentRanking: null, targetUrl: null }, intentEnum, null),
          source: KeywordSource.AI_SUGGESTED
        });
      }
    } catch (err) {
      console.error('AI keyword discovery failed', err);
      // We continue with what we have
    }
  }

  // Convert to array and sort by opportunity score descending, then relevance
  return Array.from(discovered.values()).sort((a, b) => {
    const scoreA = a.opportunityScore || 0;
    const scoreB = b.opportunityScore || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.relevance - a.relevance;
  });
}
