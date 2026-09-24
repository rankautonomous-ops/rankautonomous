import { PrismaClient, RecommendationCategory, RecommendationActionType, AutomationType } from '@prisma/client';
import { CandidateRecommendation } from './types';

const prisma = new PrismaClient();

export async function collectSignals(websiteId: string): Promise<CandidateRecommendation[]> {
  const candidates: CandidateRecommendation[] = [];

  // 1. SEO Audit Issues
  const seoIssues = await prisma.seoIssue.findMany({
    where: { websiteId, status: 'OPEN' }
  });

  for (const issue of seoIssues) {
    let type: RecommendationActionType = RecommendationActionType.FIX_TECHNICAL_ISSUE;
    let category: RecommendationCategory = RecommendationCategory.TECHNICAL;
    let impact = 50;
    let effort = 50;
    
    if (issue.priority === 'CRITICAL' || issue.priority === 'HIGH') impact = 80;
    else if (issue.priority === 'LOW') impact = 40;

    if (issue.category.toUpperCase().includes('ON_PAGE') || issue.title.toUpperCase().includes('TITLE') || issue.title.toUpperCase().includes('META')) {
      category = RecommendationCategory.ON_PAGE;
      effort = 20; // Easy to fix
    }

    candidates.push({
      websiteId,
      type,
      category,
      title: `Fix: ${issue.title}`,
      description: issue.description,
      sourceType: 'SEO_ISSUE',
      sourceId: issue.id,
      targetUrl: issue.affectedUrl || undefined,
      automationType: AutomationType.MANUAL,
      rawImpact: impact,
      rawEffort: effort,
      rawConfidence: 90,
      rawOpportunity: impact,
      deduplicationKey: `${websiteId}-${category}-${issue.title.substring(0, 30)}-${issue.affectedUrl || 'global'}`,
    });
  }

  // 2. Keyword Opportunities
  const keywords = await prisma.keyword.findMany({
    where: { websiteId }
  });

  for (const kw of keywords) {
    if (!kw.intent || kw.searchVolume === null) continue;
    
    // Simplistic ranking criteria for example
    // In real app, check if we rank for it, if no article exists, etc.
    const hasArticle = await prisma.article.findFirst({ where: { websiteId, primaryKeyword: kw.keyword }});
    
    if (!hasArticle && kw.difficulty && kw.difficulty < 50) {
      candidates.push({
        websiteId,
        type: RecommendationActionType.CREATE_ARTICLE,
        category: RecommendationCategory.KEYWORD,
        title: `Create content for "${kw.keyword}"`,
        description: `Targeting this keyword has good potential. Difficulty is ${kw.difficulty}, search volume is ${kw.searchVolume}.`,
        sourceType: 'KEYWORD',
        sourceId: kw.id,
        targetKeyword: kw.keyword,
        automationType: AutomationType.AI_ASSISTED,
        rawImpact: Math.min((kw.searchVolume / 1000) * 50, 100),
        rawEffort: 60, // Writing an article
        rawConfidence: 80,
        rawOpportunity: 100 - kw.difficulty,
        deduplicationKey: `${websiteId}-KEYWORD-CREATE-${kw.keyword.toLowerCase()}`,
      });
    }
  }

  // 3. Competitor Gaps
  const competitors = await prisma.competitor.findMany({
    where: { websiteId }
  });

  for (const comp of competitors) {
    if (comp.analysisData && typeof comp.analysisData === 'object') {
      const data = comp.analysisData as any;
      if (data.contentGaps && Array.isArray(data.contentGaps)) {
        for (const gap of data.contentGaps) {
          candidates.push({
            websiteId,
            type: RecommendationActionType.CREATE_ARTICLE,
            category: RecommendationCategory.COMPETITOR,
            title: `Cover competitor gap: ${gap}`,
            description: `Your competitor ${comp.domain} covers "${gap}", but you do not.`,
            sourceType: 'COMPETITOR',
            sourceId: comp.id,
            targetKeyword: gap,
            automationType: AutomationType.AI_ASSISTED,
            rawImpact: 70,
            rawEffort: 60,
            rawConfidence: 75,
            rawOpportunity: 80,
            deduplicationKey: `${websiteId}-COMPETITOR-CREATE-${gap.toLowerCase()}`,
          });
        }
      }
    }
  }

  // 4. Backlink Opportunities
  const backlinks = await prisma.backlinkOpportunity.findMany({
    where: { websiteId, status: 'QUALIFIED' } // Ready for outreach
  });

  for (const opp of backlinks) {
    candidates.push({
      websiteId,
      type: RecommendationActionType.START_OUTREACH,
      category: RecommendationCategory.BACKLINK,
      title: `Start outreach for ${opp.domain}`,
      description: `A qualified backlink opportunity was found for ${opp.domain}.`,
      sourceType: 'BACKLINK_OPPORTUNITY',
      sourceId: opp.id,
      targetUrl: opp.url || undefined,
      automationType: AutomationType.AI_ASSISTED,
      rawImpact: 60,
      rawEffort: 30, // Outreach is moderately easy with AI
      rawConfidence: 85,
      rawOpportunity: opp.relevance || 50,
      deduplicationKey: `${websiteId}-BACKLINK-OUTREACH-${opp.id}`,
    });
  }

  return candidates;
}
