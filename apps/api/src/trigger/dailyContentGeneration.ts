import { task, logger } from '@trigger.dev/sdk/v3';
import prisma from '../lib/database';
import { generateArticle } from '../services/aiContent/index';

export const dailyContentGeneration = task({
  id: 'daily-content-generation',
  maxDuration: 600, // 10 minutes
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 60000,
  },
  run: async (payload: { websiteId: string }) => {
    logger.info(`Starting daily content generation for website: ${payload.websiteId}`);

    const website = await prisma.website.findUnique({
      where: { id: payload.websiteId }
    });

    if (!website) {
      logger.error('Website not found');
      return { success: false, message: 'Website not found' };
    }

    if (!website.contentAutomationEnabled) {
      logger.info('Content automation is disabled for this website');
      return { success: false, message: 'Automation disabled' };
    }

    const articleToGenerate = await prisma.article.findFirst({
      where: {
        websiteId: payload.websiteId,
        status: { in: ['PLANNED', 'SCHEDULED', 'IDEA'] },
        scheduledAt: { lte: new Date() }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    if (!articleToGenerate) {
      logger.info('No eligible scheduled articles found for today');
      return { success: false, message: 'No eligible articles' };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const generatedToday = await prisma.article.findFirst({
      where: {
        websiteId: payload.websiteId,
        status: { in: ['DRAFT', 'AI_REVIEW', 'USER_REVIEW', 'APPROVED', 'PUBLISHED'] },
        updatedAt: { gte: startOfDay } 
      }
    });

    if (generatedToday) {
      logger.info('An article was already generated today. Skipping.');
      return { success: false, message: 'Daily limit reached' };
    }

    const updated = await prisma.article.updateMany({
      where: {
        id: articleToGenerate.id,
        status: { in: ['PLANNED', 'SCHEDULED', 'IDEA'] }
      },
      data: { status: 'GENERATING' }
    });

    if (updated.count === 0) {
      logger.error('Article was already picked up or changed status');
      return { success: false, message: 'Concurrency conflict' };
    }

    try {
      logger.info(`Generating article for: ${articleToGenerate.topic || articleToGenerate.primaryKeyword}`);
      
      const job = await prisma.aiJob.create({
        data: {
          userId: website.userId,
          websiteId: website.id,
          type: 'GENERATE_ARTICLE',
          payload: { articleId: articleToGenerate.id }
        }
      });
      
      await prisma.article.update({
        where: { id: articleToGenerate.id },
        data: { generationJobId: job.id }
      });

      await generateArticle(job.id);

      logger.info(`Successfully generated article: ${articleToGenerate.id}`);
      return { success: true, articleId: articleToGenerate.id };

    } catch (err: any) {
      logger.error('Failed to generate article', { error: err.message });
      
      await prisma.article.update({
        where: { id: articleToGenerate.id },
        data: { status: 'FAILED' }
      });

      throw err;
    }
  }
});
