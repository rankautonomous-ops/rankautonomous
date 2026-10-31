import prisma from '../../lib/database';
import { discoverOpportunities, normalizeOpportunityType } from './discovery/discoverOpportunities';
import { qualifyOpportunity } from './qualifyOpportunity';
import { generateOutreachMessage } from './generateOutreach';

export interface AutomaticBacklinkOptions {
  websiteId: string;
  articleId?: string;
  topic?: string;
  keyword?: string;
  targetUrl?: string;
  maxCandidates?: number;
}

export interface AutomaticBacklinkResult {
  success: boolean;
  websiteId: string;
  articleId?: string;
  discoveredCount: number;
  qualifiedCount: number;
  campaignsCreated: number;
  opportunities: Array<{
    id: string;
    domain: string;
    url: string | null;
    status: string;
    relevance: number | null;
    campaignId?: string | null;
  }>;
  message?: string;
}

/**
 * Executes the complete autonomous backlink-generation workflow for a website & blog article:
 * 1. Derives context from newly published or active article / topic / target keyword.
 * 2. Discovers real, reachable candidate websites & resource pages via SSRF-safe discovery.
 * 3. Persists candidates as BacklinkOpportunity in DISCOVERED status (never faking acquired backlinks).
 * 4. Qualifies candidates using the topical qualification engine (transitioning to QUALIFIED).
 * 5. Generates professional, non-deceptive outreach campaigns and messages (transitioning to READY).
 * 6. Preserves strict integrity: NO Backlink records are created until a live link is actually acquired.
 */
export async function executeAutomaticBacklinkGeneration(
  options: AutomaticBacklinkOptions
): Promise<AutomaticBacklinkResult> {
  const { websiteId } = options;
  console.log(`[BacklinkWorkflow] Starting backlink generation workflow for website ${websiteId}`);

  const website = await prisma.website.findUnique({
    where: { id: websiteId }
  });

  if (!website) {
    return {
      success: false,
      websiteId,
      discoveredCount: 0,
      qualifiedCount: 0,
      campaignsCreated: 0,
      opportunities: [],
      message: 'Website not found'
    };
  }

  // 1. Identify article context if not explicitly provided
  let article: any = null;
  if (options.articleId) {
    article = await prisma.article.findUnique({ where: { id: options.articleId } });
  } else {
    article = await prisma.article.findFirst({
      where: { websiteId, status: { in: ['PUBLISHED', 'APPROVED', 'DRAFT'] } },
      orderBy: { createdAt: 'desc' }
    });
  }

  const topic = options.topic || article?.topic || article?.title || website.industry || 'SEO and Content Strategy';
  const keyword = options.keyword || article?.primaryKeyword || (website.primaryKeywords && website.primaryKeywords[0]) || topic;
  const targetPage = options.targetUrl || (article?.slug ? `${website.url.replace(/\/$/, '')}/blog/${article.slug}` : website.url);

  console.log(`[BacklinkWorkflow] Context: topic="${topic}", keyword="${keyword}", targetPage="${targetPage}"`);

  // 2. Discover candidates
  const limit = options.maxCandidates || 5;
  const discovered = await discoverOpportunities(websiteId, {
    topic,
    keyword,
    targetPage,
    maxResults: limit
  });

  console.log(`[BacklinkWorkflow] Discovered ${discovered.length} candidates`);

  const createdOpportunities = [];

  // 3. Persist opportunities (Status: DISCOVERED)
  for (const cand of discovered) {
    const existing = await prisma.backlinkOpportunity.findFirst({
      where: { websiteId, domain: cand.domain }
    });

    if (existing) {
      createdOpportunities.push(existing);
      continue;
    }

    const opp = await prisma.backlinkOpportunity.create({
      data: {
        websiteId,
        domain: cand.domain,
        url: cand.url,
        type: normalizeOpportunityType(cand.type),
        relevance: cand.relevance || 50,
        suggestedAction: cand.reason || 'Resource link or guest post outreach',
        suggestedAnchor: keyword || topic || website.name,
        status: 'DISCOVERED'
      }
    });

    createdOpportunities.push(opp);
  }

  // 4. Qualify opportunities (DISCOVERED -> QUALIFIED)
  let qualifiedCount = 0;
  const qualifiedOpps = [];

  for (const opp of createdOpportunities) {
    try {
      if (opp.status === 'DISCOVERED') {
        const qualified = await qualifyOpportunity(opp.id, websiteId);
        qualifiedOpps.push(qualified);
        qualifiedCount++;
      } else {
        qualifiedOpps.push(opp);
      }
    } catch (qualErr: any) {
      console.warn(`[BacklinkWorkflow] Failed to qualify opportunity ${opp.id}:`, qualErr.message);
      qualifiedOpps.push(opp);
    }
  }

  // 5. Create Outreach Campaigns for qualified prospects (relevance >= 40)
  let campaignsCreated = 0;
  const finalOpportunities = [];

  for (const opp of qualifiedOpps) {
    let finalOpp = opp;

    if (opp.status === 'QUALIFIED' && (opp.relevance ?? 0) >= 40) {
      try {
        const existingCamp = await prisma.backlinkCampaign.findFirst({
          where: { websiteId, opportunityId: opp.id }
        });

        if (!existingCamp) {
          const campaign = await prisma.backlinkCampaign.create({
            data: {
              websiteId,
              opportunityId: opp.id,
              status: 'DRAFT',
              subject: `Partnership & Resource Collaboration: ${website.name}`,
              message: `Hi there,\n\nI came across your site (${opp.domain}) while researching ${topic}. We recently published a comprehensive guide on "${topic}" that your readers might find valuable.\n\nWould love to collaborate!\n\nBest,\nEditorial Team at ${website.name}`
            }
          });

          // Generate tailored AI outreach message
          try {
            await generateOutreachMessage(campaign.id, websiteId);
          } catch (aiOutreachErr) {
            // Keep default non-deceptive draft
          }

          finalOpp = await prisma.backlinkOpportunity.update({
            where: { id: opp.id },
            data: { campaignId: campaign.id, status: 'READY' }
          });

          campaignsCreated++;
        }
      } catch (campErr: any) {
        console.warn(`[BacklinkWorkflow] Failed to create campaign for opportunity ${opp.id}:`, campErr.message);
      }
    }

    finalOpportunities.push({
      id: finalOpp.id,
      domain: finalOpp.domain,
      url: finalOpp.url,
      status: finalOpp.status,
      relevance: finalOpp.relevance,
      campaignId: finalOpp.campaignId
    });
  }

  console.log(`[BacklinkWorkflow] Completed workflow. Discovered: ${createdOpportunities.length}, Qualified: ${qualifiedCount}, Campaigns: ${campaignsCreated}`);

  return {
    success: true,
    websiteId,
    articleId: options.articleId,
    discoveredCount: createdOpportunities.length,
    qualifiedCount,
    campaignsCreated,
    opportunities: finalOpportunities
  };
}

