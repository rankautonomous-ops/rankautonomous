import prisma from '../../lib/database';
import { getAiProvider } from '../aiProvider';
import { buildStrategyPrompt } from './prompt';
import { validateStrategyOutput } from './schema';


export async function startSeoStrategy(strategyId: string) {
  try {
    // 1. Fetch Strategy and Mark Processing
    const strategy = await prisma.seoStrategy.findUnique({ where: { id: strategyId } });
    if (!strategy) throw new Error('Strategy not found');

    await prisma.seoStrategy.update({
      where: { id: strategyId },
      data: { status: 'PROCESSING' }
    });

    // 2. Load Data
    const website = await prisma.website.findUnique({
      where: { id: strategy.websiteId }
    });
    if (!website) throw new Error('Website not found');

    // Fetch pages, limiting to 30 to prevent massive payloads
    const crawl = await prisma.crawlJob.findUnique({
      where: { id: strategy.crawlJobId },
      include: { pages: { take: 30, orderBy: { depth: 'asc' } } }
    });
    if (!crawl) throw new Error('CrawlJob not found');

    // Fetch top 50 issues
    const audit = await prisma.seoAudit.findUnique({
      where: { id: strategy.seoAuditId },
      include: { seoIssues: { take: 50 } }
    });
    if (!audit) throw new Error('SeoAudit not found');

    // Sort issues manually to ensure CRITICAL first
    const priorityWeight: Record<string, number> = { 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4 };
    audit.seoIssues.sort((a, b) => (priorityWeight[a.priority] || 99) - (priorityWeight[b.priority] || 99));

    // 3. Prepare payload
    const pagesPayload = crawl.pages.map(p => ({
      url: p.url,
      statusCode: p.statusCode,
      title: p.title,
      description: p.description,
      h1: p.h1,
      wordCount: p.wordCount,
      internalLinksCount: p.internalLinks && Array.isArray(p.internalLinks) ? p.internalLinks.length : 0
    }));

    const issuesPayload = audit.seoIssues.map(i => ({
      title: i.title,
      category: i.category,
      priority: i.priority,
      affectedUrl: i.affectedUrl
    }));

    const dataContext = {
      website,
      crawl: { crawledUrls: crawl.crawledUrls },
      pages: pagesPayload,
      audit: { healthScore: audit.healthScore },
      issues: issuesPayload
    };

    // 4. Build Prompt
    const { systemPrompt, userPrompt } = buildStrategyPrompt(dataContext);

    // 5. Call AI
    const ai = getAiProvider();
    const resultJsonStr = await ai.generateCompletion({
      systemPrompt,
      userPrompt,
      responseFormat: 'json_object',
      temperature: 0.2 // Lower temp for more deterministic structure
    });

    // 6. Validate Output
    let parsed: any;
    try {
      parsed = JSON.parse(resultJsonStr);
    } catch (e) {
      throw new Error('AI returned invalid JSON');
    }

    const validatedStrategy = validateStrategyOutput(parsed);

    // 7. Save and Complete
    await prisma.seoStrategy.update({
      where: { id: strategyId },
      data: {
        status: 'COMPLETED',
        summary: validatedStrategy.executiveSummary,
        strategyData: validatedStrategy as any
      }
    });

  } catch (err: any) {
    console.error(`[SEO Strategy Error] Strategy ${strategyId} failed:`, err);
    await prisma.seoStrategy.update({
      where: { id: strategyId },
      data: {
        status: 'FAILED',
        error: err.message || 'Unknown error occurred during strategy generation'
      }
    });
  }
}
