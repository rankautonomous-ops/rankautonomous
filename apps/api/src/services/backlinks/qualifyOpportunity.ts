import prisma from '../../lib/database';
import { fetchSafely } from './backlinkFetcher';
import { getAiProvider } from '../aiProvider';
import * as cheerio from 'cheerio';

export async function qualifyOpportunity(opportunityId: string, websiteId: string) {
  const opp = await prisma.backlinkOpportunity.findUnique({
    where: { id: opportunityId }
  });

  if (!opp || opp.websiteId !== websiteId) {
    throw new Error('Opportunity not found');
  }

  const website = await prisma.website.findUnique({
    where: { id: websiteId }
  });

  if (!website) {
    throw new Error('Website not found');
  }

  let isReachable = false;
  let pageContent = '';
  
  if (opp.url) {
    try {
      const resp = await fetchSafely(opp.url);
      if (resp.success && resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 400) {
        isReachable = true;
        const html = resp.body || '';
        const $ = cheerio.load(html);
        pageContent = $('body').text().replace(/\s+/g, ' ').substring(0, 3000); // Take first 3000 chars for analysis
      }
    } catch (err) {
      console.log(`Failed to fetch ${opp.url} for qualification:`, err);
    }
  } else {
    // We only have a domain, try to fetch the homepage
    try {
      const resp = await fetchSafely(`https://${opp.domain}`);
      if (resp.success && resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 400) {
        isReachable = true;
        const html = resp.body || '';
        const $ = cheerio.load(html);
        pageContent = $('body').text().replace(/\s+/g, ' ').substring(0, 3000);
      }
    } catch (err) {
      console.log(`Failed to fetch ${opp.domain} for qualification:`, err);
    }
  }

  let relevanceScore = 50; // Default middle score
  let qualificationNotes = '';

  if (isReachable && pageContent.length > 100) {
    const ai = getAiProvider();
    
    const systemPrompt = `You are the RankAutonomous Qualification Engine. Calculate a deterministic RankAutonomous Opportunity Score (0-100) based on topical relevance, content fit, and industry overlap between the target page content and the user's website.
    Do NOT output Domain Authority or other third-party SEO metrics.
    Return a JSON object:
    {
      "rankAutonomousOpportunityScore": number,
      "relevanceReasoning": string
    }`;

    const userPrompt = `Website Industry: ${website.industry}
Target Audience: ${website.targetAudience}

Target Page Content Snippet:
${pageContent}

Evaluate how relevant a backlink from this target page would be to the given website.`;

    try {
      const aiResponse = await ai.generateCompletion({
        systemPrompt,
        userPrompt,
        responseFormat: 'json_object',
        temperature: 0.2
      });

      const parsed = JSON.parse(aiResponse);
      relevanceScore = typeof parsed.rankAutonomousOpportunityScore === 'number' ? parsed.rankAutonomousOpportunityScore : 50;
      qualificationNotes = parsed.relevanceReasoning || '';
    } catch (error) {
      console.error('AI qualification failed:', error);
      qualificationNotes = 'Failed to analyze page content via AI.';
    }
  } else {
    qualificationNotes = isReachable ? 'Page has very little text content.' : 'Page is not reachable or blocks automated requests.';
    relevanceScore = isReachable ? 30 : 0;
  }

  // Update the opportunity
  const updated = await prisma.backlinkOpportunity.update({
    where: { id: opp.id },
    data: {
      relevance: relevanceScore,
      status: opp.status === 'DISCOVERED' ? 'QUALIFIED' : opp.status,
      domainInfo: {
        ...(opp.domainInfo as any || {}),
        isReachable,
        qualificationNotes,
        lastQualifiedAt: new Date().toISOString()
      }
    }
  });

  return updated;
}
