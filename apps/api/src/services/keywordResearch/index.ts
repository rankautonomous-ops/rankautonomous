import { SearchIntent, KeywordSource } from '@prisma/client';
import prisma from '../../lib/database';
import { normalizeKeyword } from './normalization';
import { calculateOpportunityScore } from './scoring';
import { clusterKeywords } from './clustering';
import { getKeywordResearchProvider } from './provider';
import { KeywordCreationDto } from './types';


export async function addKeywords(websiteId: string, dtos: KeywordCreationDto[]) {
  const results = [];
  
  for (const dto of dtos) {
    const normalized = normalizeKeyword(dto.keyword);
    if (!normalized) continue;

    // Check if it exists
    const existing = await prisma.keyword.findUnique({
      where: {
        websiteId_normalizedKeyword: {
          websiteId,
          normalizedKeyword: normalized
        }
      }
    });

    if (existing) {
      results.push(existing);
      continue;
    }

    const keyword = await prisma.keyword.create({
      data: {
        websiteId,
        keyword: dto.keyword,
        normalizedKeyword: normalized,
        intent: dto.intent,
        targetUrl: dto.targetUrl,
        source: dto.source || KeywordSource.USER_ENTERED,
      }
    });
    
    results.push(keyword);
  }

  // After adding, we run clustering on all active keywords for this website
  await reclusterWebsiteKeywords(websiteId);
  return results;
}

export async function importAiSuggestions(websiteId: string, suggestions: { keyword: string; intent?: string }[]) {
  const dtos: KeywordCreationDto[] = suggestions.map(s => {
    let intentEnum: SearchIntent | null = null;
    if (s.intent && Object.values(SearchIntent).includes(s.intent as SearchIntent)) {
      intentEnum = s.intent as SearchIntent;
    }
    return {
      keyword: s.keyword,
      intent: intentEnum,
      source: KeywordSource.AI_SUGGESTED
    };
  });

  return addKeywords(websiteId, dtos);
}

export async function reclusterWebsiteKeywords(websiteId: string) {
  const activeKeywords = await prisma.keyword.findMany({
    where: { websiteId, status: 'ACTIVE' }
  });

  const normalizedList = activeKeywords.map(k => k.normalizedKeyword);
  const clusters = clusterKeywords(normalizedList);

  for (const kw of activeKeywords) {
    const assignedCluster = clusters[kw.normalizedKeyword] || null;
    if (kw.cluster !== assignedCluster) {
      await prisma.keyword.update({
        where: { id: kw.id },
        data: { cluster: assignedCluster }
      });
    }
  }
}

export async function enrichKeywordsData(websiteId: string, keywordIds: string[]) {
  const provider = getKeywordResearchProvider();
  if (!provider) {
    throw new Error('NOT_CONFIGURED');
  }

  const keywordsToEnrich = await prisma.keyword.findMany({
    where: {
      id: { in: keywordIds },
      websiteId,
      status: 'ACTIVE'
    }
  });

  if (!keywordsToEnrich.length) return [];

  const rawKeywords = keywordsToEnrich.map(k => k.keyword);
  const metricsMap = await provider.enrichKeywords(rawKeywords);

  const updated = [];
  for (const kw of keywordsToEnrich) {
    const metrics = metricsMap[kw.keyword];
    if (metrics) {
      const oppScore = calculateOpportunityScore(metrics, kw.intent);
      
      const updatedKw = await prisma.keyword.update({
        where: { id: kw.id },
        data: {
          searchVolume: metrics.searchVolume,
          difficulty: metrics.keywordDifficulty,
          currentRanking: metrics.currentRanking,
          targetUrl: metrics.targetUrl || kw.targetUrl, // don't overwrite if provider has none but user had one
          opportunityScore: oppScore
        }
      });
      updated.push(updatedKw);
    }
  }

  return updated;
}
