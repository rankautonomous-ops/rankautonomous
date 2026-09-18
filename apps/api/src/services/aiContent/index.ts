import prisma from '../../lib/database';
import { getAiProvider, AiProviderError } from '../aiProvider';
import { buildContentGenerationPrompt, buildContentReviewPrompt } from './prompt';
import { validateContentGenerationOutput, validateContentReviewOutput } from './schema';

function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Sanitizes errors to prevent exposing raw API keys or internal stack traces.
 */
function sanitizeErrorMessage(err: any): string {
  const raw = String(err?.message || 'Unknown generation error');
  // Strip potential API keys or sensitive query parameters
  return raw.replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=***').replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer ***');
}

export async function generateArticle(jobId: string): Promise<void> {
  try {
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('AiJob not found');

    const articleId = (job.payload as any)?.articleId;
    if (!articleId) throw new Error('AiJob missing articleId in payload');

    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new Error('Article not found');

    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() }
    });

    const website = await prisma.website.findUnique({ where: { id: article.websiteId } });
    if (!website) throw new Error('Website not found');

    // Fetch up to 100 successful crawled pages for internal link validation
    let validPages: Array<{ url: string; title: string | null }> = [];
    const latestCrawl = await prisma.crawlJob.findFirst({
      where: { websiteId: website.id, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' }
    });

    if (latestCrawl) {
      validPages = await prisma.pageResult.findMany({
        where: { crawlJobId: latestCrawl.id, status: 'SUCCESS' },
        take: 100,
        select: { url: true, title: true }
      });
    }

    const dataContext = {
      config: {
        topic: article.topic,
        primaryKeyword: article.primaryKeyword,
        wordCount: article.wordCount,
        tone: article.tone,
        language: article.language,
        targetAudience: article.targetAudience,
        targetLocation: article.targetLocation,
        callToAction: article.callToAction
      },
      website: {
        name: website.name,
        industry: website.industry
      },
      validPages
    };

    const { systemPrompt, userPrompt } = buildContentGenerationPrompt(dataContext);

    const ai = getAiProvider();
    const resultJsonStr = await ai.generateCompletion({
      systemPrompt,
      userPrompt,
      responseFormat: 'json_object',
      temperature: 0.7,
      maxTokens: 4000
    });

    let parsed: any;
    try {
      parsed = JSON.parse(resultJsonStr);
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    const validated = validateContentGenerationOutput(parsed);

    // Strict internal-links validation: filter against known crawled URLs to prevent fabrication
    const validUrls = new Set(validPages.map(p => p.url));
    const safeInternalLinks = validated.internalLinks.filter(url => validUrls.has(url));

    const wordCount = countWords(validated.content);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        title: validated.title,
        metaDescription: validated.metaDescription,
        slug: validated.slug,
        content: validated.content,
        seoData: {
          headings: validated.headings,
          imageSuggestions: validated.imageSuggestions
        },
        internalLinks: safeInternalLinks,
        wordCount,
        status: 'DRAFT',
        generationJobId: jobId,
        generationMetadata: {
          generatedAt: new Date().toISOString(),
          requestedWordCount: article.wordCount,
          actualWordCount: wordCount
        }
      }
    });

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        result: {
          title: validated.title,
          wordCount
        }
      }
    });

  } catch (err: any) {
    const safeErr = sanitizeErrorMessage(err);
    console.error(`[AI Content] Generation job ${jobId} failed:`, safeErr);
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: safeErr
      }
    });
  }
}

export async function reviewArticle(jobId: string): Promise<void> {
  try {
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('AiJob not found');

    const articleId = (job.payload as any)?.articleId;
    if (!articleId) throw new Error('AiJob missing articleId in payload');

    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new Error('Article not found');

    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() }
    });

    const dataContext = {
      config: {
        topic: article.topic,
        primaryKeyword: article.primaryKeyword,
        tone: article.tone
      },
      article: {
        title: article.title,
        metaDescription: article.metaDescription,
        slug: article.slug,
        content: article.content,
        wordCount: article.wordCount
      }
    };

    const { systemPrompt, userPrompt } = buildContentReviewPrompt(dataContext);

    const ai = getAiProvider();
    const resultJsonStr = await ai.generateCompletion({
      systemPrompt,
      userPrompt,
      responseFormat: 'json_object',
      temperature: 0.3,
      maxTokens: 2000
    });

    let parsed: any;
    try {
      parsed = JSON.parse(resultJsonStr);
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    const validated = validateContentReviewOutput(parsed);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        aiReviewData: validated as any,
        reviewJobId: jobId,
        status: 'USER_REVIEW'
      }
    });

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        result: { score: validated.score }
      }
    });

  } catch (err: any) {
    const safeErr = sanitizeErrorMessage(err);
    console.error(`[AI Content Review] Review job ${jobId} failed:`, safeErr);
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: safeErr
      }
    });
  }
}
