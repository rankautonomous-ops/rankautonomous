import * as cheerio from 'cheerio';
import { URL } from 'url';
import { fetchSafely } from '../backlinks/backlinkFetcher';
import { getAiProvider } from '../aiProvider';
import prisma from '../../lib/database';
import { CompetitorStatus, KeywordSource, SearchIntent } from '@prisma/client';
import { buildCompetitorAnalysisPrompt, buildCompetitorSuggestPrompt } from './prompt';
import { addKeywords } from '../keywordResearch/index';

export function normalizeCompetitorUrl(raw: string): string | null {
  try {
    let toParse = raw.trim();
    if (!toParse.startsWith('http://') && !toParse.startsWith('https://')) {
      toParse = `https://${toParse}`;
    }
    const u = new URL(toParse);
    let final = `${u.protocol}//${u.host}${u.pathname !== '/' ? u.pathname : ''}`;
    if (final.endsWith('/')) {
        final = final.slice(0, -1);
    }
    return final;
  } catch (err) {
    return null;
  }
}

export function parseAiJson(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
  }
  return JSON.parse(cleaned);
}

export function extractDomain(normalized: string): string | null {
  try {
    const u = new URL(normalized);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export async function extractCompetitorData(url: string) {
  const fetchResult = await fetchSafely(url);
  if (!fetchResult.success || !fetchResult.body) {
    throw new Error(`Failed to safely fetch competitor: ${fetchResult.errorMessage || fetchResult.errorCode}`);
  }

  const $ = cheerio.load(fetchResult.body);

  const title = $('title').text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;

  const h1 = $('h1').map((_, el) => $(el).text().trim()).get();
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get();
  const h3 = $('h3').map((_, el) => $(el).text().trim()).get();
  
  const navText = $('nav, header').text().trim().replace(/\s+/g, ' ');
  const visibleText = $('body').text().trim().replace(/\s+/g, ' ');
  const wordCount = visibleText.split(/\s+/).filter(w => w.length > 0).length;

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];

  const baseHost = new URL(fetchResult.finalUrl).host;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const u = new URL(href, fetchResult.finalUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        if (u.host === baseHost || u.host === `www.${baseHost}` || `www.${u.host}` === baseHost) {
          internalLinks.push(u.href);
        } else {
          externalLinks.push(u.href);
        }
      }
    } catch {
      // invalid URL
    }
  });

  return {
    finalUrl: fetchResult.finalUrl,
    title,
    metaDescription,
    canonicalUrl,
    h1,
    h2,
    h3,
    navText: navText.substring(0, 1000), // bounded
    visibleText: visibleText.substring(0, 5000), // bounded for AI context
    wordCount,
    internalLinks: Array.from(new Set(internalLinks)).slice(0, 50),
    externalLinks: Array.from(new Set(externalLinks)).slice(0, 50),
  };
}

export async function suggestCompetitors(websiteId: string) {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website) throw new Error('Website not found');

  const context = {
    website: {
      name: website.name,
      url: website.url,
      industry: website.industry,
      targetAudience: website.targetAudience,
      targetLocationType: website.targetLocationType,
      targetRegion: website.targetRegion,
      targetCity: website.targetCity,
      primaryKeywords: website.primaryKeywords,
      description: website.description,
      seoGoals: website.seoGoals
    }
  };

  const { systemPrompt, userPrompt } = buildCompetitorSuggestPrompt(context);
  const ai = getAiProvider();
  
  let parsed: any;
  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    try {
      const resultJsonStr = await ai.generateCompletion({
        systemPrompt,
        userPrompt,
        responseFormat: 'json_object',
        temperature: 0.7,
        maxTokens: 1000
      });
      parsed = parseAiJson(resultJsonStr);
      break;
    } catch (err: any) {
      if (attempts >= 2) {
        let code = 'UNKNOWN_ERROR';
        let message = err.message || 'An unexpected error occurred';
        let retryable = false;

        if (err.name === 'AiProviderError') {
          code = err.code || 'AI_ERROR';
          message = err.message;
          retryable = err.retryable || false;
        } else if (err.message === 'AI returned invalid JSON') {
          code = 'AI_INVALID_RESPONSE';
          message = 'The AI service returned an invalid response. Please retry.';
          retryable = true;
        }

        const safeError = new Error(message);
        (safeError as any).code = code;
        (safeError as any).retryable = retryable;
        throw safeError;
      }
    }
  }

  if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
    throw new Error('AI returned malformed suggestions');
  }

  // Validate each suggestion by safely fetching its homepage
  const validSuggestions = [];
  for (const suggestion of parsed.suggestions) {
    if (!suggestion.url || !suggestion.domain) continue;
    const normalized = normalizeCompetitorUrl(suggestion.url);
    if (!normalized) continue;
    
    try {
      const fetchResult = await fetchSafely(normalized);
      if (fetchResult.success && fetchResult.statusCode === 200) {
        validSuggestions.push({
          domain: extractDomain(normalized) || suggestion.domain,
          url: normalized,
          reason: suggestion.reason
        });
      }
    } catch {
      // skip invalid competitor
    }
  }

  return validSuggestions;
}

export async function analyzeCompetitor(competitorId: string, websiteId: string) {
  await prisma.competitor.update({
    where: { id: competitorId, websiteId },
    data: { status: CompetitorStatus.ANALYZING }
  });

  try {
    const competitor = await prisma.competitor.findUnique({
      where: { id: competitorId, websiteId }
    });
    if (!competitor || !competitor.url) throw new Error('Competitor not found or missing URL');

    const website = await prisma.website.findUnique({ where: { id: websiteId } });
    if (!website) throw new Error('Website not found');

    const keywords = await prisma.keyword.findMany({
      where: { websiteId, status: 'ACTIVE' },
      take: 50,
      select: { keyword: true }
    });

    const competitorData = await extractCompetitorData(competitor.url);

    const context = {
      website: {
        name: website.name,
        industry: website.industry,
        targetAudience: website.targetAudience,
        seoGoals: website.seoGoals
      },
      keywords: keywords.map(k => k.keyword),
      competitorData
    };

    const { systemPrompt, userPrompt } = buildCompetitorAnalysisPrompt(context);
    const ai = getAiProvider();
    
    let parsed: any;
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        const resultJsonStr = await ai.generateCompletion({
          systemPrompt,
          userPrompt,
          responseFormat: 'json_object',
          temperature: 0.5,
          maxTokens: 2500
        });
        parsed = parseAiJson(resultJsonStr);
        break;
      } catch (err: any) {
        if (attempts >= 2) {
          let code = 'UNKNOWN_ERROR';
          let message = err.message || 'An unexpected error occurred';
          let retryable = false;

          if (err.name === 'AiProviderError') {
            code = err.code || 'AI_ERROR';
            message = err.message;
            retryable = err.retryable || false;
          } else if (err.message === 'AI returned invalid JSON') {
            code = 'AI_INVALID_RESPONSE';
            message = 'The AI service returned an invalid response. Please retry.';
            retryable = true;
          }

          const safeError = new Error(message);
          (safeError as any).code = code;
          (safeError as any).retryable = retryable;
          throw safeError;
        }
      }
    }

    // Validate parsed output structure
    const structuredAnalysis = {
      positioning: parsed.positioning || '',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      contentThemes: Array.isArray(parsed.contentThemes) ? parsed.contentThemes : [],
      keywordOpportunities: Array.isArray(parsed.keywordOpportunities) ? parsed.keywordOpportunities.map((k: any) => ({
        keyword: k.keyword || '',
        intent: k.intent || null,
        reason: k.reason || '',
        relevance: Number(k.relevance) || 5,
        opportunityDescription: k.opportunityDescription || ''
      })) : [],
      contentGaps: Array.isArray(parsed.contentGaps) ? parsed.contentGaps.map((g: any) => ({
        topic: g.topic || '',
        suggestedTitle: g.suggestedTitle || '',
        reason: g.reason || '',
        targetIntent: g.targetIntent || null,
        suggestedOutline: Array.isArray(g.suggestedOutline) ? g.suggestedOutline : []
      })) : []
    };

    await prisma.competitor.update({
      where: { id: competitorId, websiteId },
      data: {
        status: CompetitorStatus.ANALYZED,
        analysisData: structuredAnalysis as any
      }
    });

    return structuredAnalysis;
  } catch (error: any) {
    const existing = await prisma.competitor.findUnique({ where: { id: competitorId, websiteId } });
    const existingData = existing?.analysisData ? (existing.analysisData as any) : {};
    
    let code = 'UNKNOWN_ERROR';
    let message = error.message || 'An unexpected error occurred';
    let retryable = false;

    if (error.name === 'AiProviderError') {
      code = error.code || 'AI_ERROR';
      message = error.message;
      retryable = error.retryable || false;
    } else if (error.message === 'AI returned invalid JSON') {
      code = 'AI_INVALID_RESPONSE';
      message = 'The AI service returned an invalid response. Please retry.';
      retryable = true;
    }

    await prisma.competitor.update({
      where: { id: competitorId, websiteId },
      data: {
        status: CompetitorStatus.ERROR,
        analysisData: {
          ...existingData,
          lastError: {
            code,
            message,
            retryable,
            timestamp: new Date().toISOString()
          }
        }
      }
    });

    const safeError = new Error(message);
    (safeError as any).code = code;
    (safeError as any).retryable = retryable;
    throw safeError;
  }
}

export async function promoteCompetitorKeyword(websiteId: string, competitorId: string, keywordData: any) {
  // Validate competitor ownership
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId, websiteId }
  });
  if (!competitor) throw new Error('Competitor not found');

  const intent = Object.values(SearchIntent).includes(keywordData.intent as SearchIntent) 
    ? (keywordData.intent as SearchIntent) 
    : undefined;

  const result = await addKeywords(websiteId, [{
    keyword: keywordData.keyword,
    intent,
    source: KeywordSource.AI_SUGGESTED
  }]);

  return result[0];
}
