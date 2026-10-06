import { SearchIntent, KeywordSource } from '@prisma/client';
import prisma from '../../lib/database';
import { normalizeKeyword } from './normalization';
import { calculateOpportunityScore } from './scoring';
import { clusterKeywords } from './clustering';
import { getKeywordResearchProvider } from './provider';
import { KeywordCreationDto } from './types';
export { discoverKeywords } from './discovery';


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

export interface KeywordEnrichmentResult {
  keywords: any[];
  providerConfigured: boolean;
  gscConnected: boolean;
  gscRecordCount: number;
  enrichedCount: number;
  message: string;
}

export async function enrichKeywordsData(websiteId: string, keywordIds: string[]): Promise<KeywordEnrichmentResult> {
  const keywordsToEnrich = await prisma.keyword.findMany({
    where: {
      id: { in: keywordIds },
      websiteId,
      status: 'ACTIVE'
    }
  });

  // Check GSC integration in database
  const gscIntegration = await prisma.integration.findFirst({
    where: {
      websiteId,
      provider: { in: ['GSC', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE'] },
      status: 'ACTIVE'
    }
  });
  const gscConnected = !!gscIntegration;

  const provider = getKeywordResearchProvider();
  const providerConfigured = !!provider;

  if (!keywordsToEnrich.length) {
    return {
      keywords: [],
      providerConfigured,
      gscConnected,
      gscRecordCount: 0,
      enrichedCount: 0,
      message: 'No active keywords found to enrich.'
    };
  }

  // GSC Metrics enrichment
  const gscRecords = await prisma.searchPerformanceRecord.groupBy({
    by: ['query'],
    where: {
      websiteId,
      query: { in: keywordsToEnrich.map(k => k.keyword) },
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    },
    _sum: { clicks: true, impressions: true },
    _avg: { position: true, ctr: true }
  });

  const gscMap = new Map(gscRecords.map(r => [
    r.query, 
    {
      impressions: r._sum.impressions || 0,
      clicks: r._sum.clicks || 0,
      position: r._avg.position || 0,
      ctr: r._avg.ctr || 0
    }
  ]));

  let metricsMap: any = {};
  if (provider) {
    try {
      metricsMap = await provider.enrichKeywords(keywordsToEnrich.map(k => k.keyword));
    } catch (e: any) {
      console.warn(`[Keyword Research] Website ${websiteId}: Provider enrichment failed (${e?.message || 'unknown error'}). Falling back to GSC only.`);
    }
  }

  const updated = [];
  for (const kw of keywordsToEnrich) {
    const metrics = metricsMap[kw.keyword] || null;
    const gsc = gscMap.get(kw.keyword) || null;
    
    // Only update if we have new data
    if (metrics || gsc) {
      const oppScore = calculateOpportunityScore(metrics, kw.intent, gsc);
      
      const updatedKw = await prisma.keyword.update({
        where: { id: kw.id },
        data: {
          searchVolume: metrics?.searchVolume ?? kw.searchVolume,
          difficulty: metrics?.keywordDifficulty ?? kw.difficulty,
          currentRanking: metrics?.currentRanking ?? gsc?.position ?? kw.currentRanking,
          targetUrl: metrics?.targetUrl || kw.targetUrl, 
          opportunityScore: oppScore,
          gscImpressions30d: gsc?.impressions ?? kw.gscImpressions30d,
          gscClicks30d: gsc?.clicks ?? kw.gscClicks30d,
          gscAvgPosition: gsc?.position ?? kw.gscAvgPosition,
          gscLastUpdated: gsc ? new Date() : kw.gscLastUpdated
        }
      });
      updated.push(updatedKw);
    }
  }

  let message = '';
  if (updated.length > 0) {
    message = `Successfully enriched ${updated.length} keyword${updated.length === 1 ? '' : 's'}.`;
  } else if (!providerConfigured && !gscConnected) {
    message = 'No keyword metrics provider is connected. Connect Google Search Console or configure a supported metrics provider to enrich keyword data.';
  } else if (gscConnected && !providerConfigured) {
    message = 'Google Search Console is connected, but no performance data was recorded for the selected keywords in the last 30 days.';
  } else {
    message = 'Connected providers did not find search metrics for the selected keywords.';
  }

  console.log(`[Keyword Research] Website ${websiteId}: Processed ${keywordsToEnrich.length} keywords. Provider configured: ${providerConfigured}, GSC connected: ${gscConnected}, Enriched: ${updated.length}.`);

  return {
    keywords: updated,
    providerConfigured,
    gscConnected,
    gscRecordCount: gscRecords.length,
    enrichedCount: updated.length,
    message
  };
}
