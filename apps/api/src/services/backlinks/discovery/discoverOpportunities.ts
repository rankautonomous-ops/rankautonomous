import prisma from '../../../lib/database';
import { getAiProvider } from '../../aiProvider';
import { fetchSafely } from '../backlinkFetcher';

export interface DiscoveryParams {
  topic?: string;
  keyword?: string;
  targetPage?: string;
  competitor?: string;
  maxResults?: number;
}

export interface DiscoveredCandidate {
  url: string;
  domain: string;
  relevance: number;
  reason: string;
  type: string;
  valid: boolean;
}

export async function discoverOpportunities(websiteId: string, params: DiscoveryParams): Promise<DiscoveredCandidate[]> {
  const website = await prisma.website.findUnique({
    where: { id: websiteId }
  });

  if (!website) {
    throw new Error('Website not found');
  }

  const limit = params.maxResults || 5;
  const candidates: DiscoveredCandidate[] = [];

  // Use AI to generate highly relevant potential domains/pages
  const ai = getAiProvider();
  
  const systemPrompt = `You are an expert SEO backlink discovery engine. Your job is to suggest REAL, highly relevant websites, directories, or resource pages that could realistically link to a given website based on its industry and the provided topic/keyword.
DO NOT hallucinate fake domains. Only suggest well-known industry sites, directories, or common resource page patterns.
Return a JSON object with a "candidates" array. Each candidate must have:
- "url": the exact URL (e.g., "https://example.com/resources")
- "domain": the root domain (e.g., "example.com")
- "relevance": a score from 0 to 100
- "reason": why they might link
- "type": one of ["GUEST_POST", "RESOURCE_PAGE", "DIRECTORY", "COMPETITOR_BACKLINK", "BROKEN_LINK", "UNLINKED_MENTION", "PARTNERSHIP"]`;

  const userPrompt = `Suggest ${limit} backlink opportunity candidates for a website in the "${website.industry || 'general'}" industry.
Target audience: ${website.targetAudience || 'General'}
${params.topic ? `Topic focus: ${params.topic}` : ''}
${params.keyword ? `Target keyword: ${params.keyword}` : ''}
${params.competitor ? `Analyze relative to competitor: ${params.competitor}` : ''}`;

  try {
    const aiResponse = await ai.generateCompletion({
      systemPrompt,
      userPrompt,
      responseFormat: 'json_object',
      temperature: 0.5
    });

    const parsed = JSON.parse(aiResponse);
    if (parsed.candidates && Array.isArray(parsed.candidates)) {
      for (const c of parsed.candidates) {
        if (c.url && c.domain) {
          candidates.push({
            url: String(c.url),
            domain: String(c.domain),
            relevance: Number(c.relevance) || 50,
            reason: String(c.reason || ''),
            type: String(c.type || 'GUEST_POST'),
            valid: false
          });
        }
      }
    }
  } catch (error) {
    console.error('AI discovery failed:', error);
  }

  // Add competitor domains if requested and not returned by AI
  if (params.competitor) {
    try {
      const compUrl = new URL(params.competitor.startsWith('http') ? params.competitor : `https://${params.competitor}`);
      if (!candidates.some(c => c.domain === compUrl.hostname)) {
         candidates.push({
           url: compUrl.toString(),
           domain: compUrl.hostname,
           relevance: 80,
           reason: 'Direct competitor analysis',
           type: 'COMPETITOR_BACKLINK',
           valid: false
         });
      }
    } catch (e) {
      // Ignore invalid competitor URL parsing
    }
  }

  // Validate the candidates by doing a HEAD or GET request
  const validCandidates: DiscoveredCandidate[] = [];
  const existingOpportunities = await prisma.backlinkOpportunity.findMany({
    where: { websiteId },
    select: { domain: true, url: true }
  });

  const existingDomains = new Set(existingOpportunities.map(o => o.domain));
  const existingUrls = new Set(existingOpportunities.map(o => o.url).filter(Boolean));

  for (const candidate of candidates) {
    // Skip if already in opportunities
    if (existingDomains.has(candidate.domain) || existingUrls.has(candidate.url)) {
      continue;
    }

    try {
      // Validate using our SSRF-safe fetcher
      const response = await fetchSafely(candidate.url);
      if (response.success && response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
        candidate.valid = true;
        validCandidates.push(candidate);
      }
    } catch (err) {
      console.log(`Validation failed for ${candidate.url}:`, err);
      // We skip invalid / hallucinated domains entirely
    }

    if (validCandidates.length >= limit) break;
  }

  return validCandidates.slice(0, limit);
}
