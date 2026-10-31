import prisma from '../lib/database';
import { QueueService } from './queue';

/**
 * Scans all websites with contentAutomationEnabled: true.
 * If a website has not yet generated or published an article today,
 * and doesn't already have a pending DAILY_CONTENT_GENERATION job in the queue,
 * automatically enqueues a DAILY_CONTENT_GENERATION job.
 */
export async function checkAndEnqueueDailyContentJobs(): Promise<number> {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const websites = await prisma.website.findMany({
      where: { contentAutomationEnabled: true },
      select: { id: true, name: true, url: true }
    });

    let enqueuedCount = 0;

    for (const site of websites) {
      // Check if already published or generated today
      const alreadyDoneToday = await prisma.article.findFirst({
        where: {
          websiteId: site.id,
          status: { in: ['DRAFT', 'AI_REVIEW', 'USER_REVIEW', 'APPROVED', 'PUBLISHED'] },
          OR: [
            { publishedAt: { gte: startOfDay } },
            { createdAt: { gte: startOfDay } }
          ]
        }
      });

      if (alreadyDoneToday) {
        continue;
      }

      // Check if job already pending in queue
      const existingJob = await prisma.backgroundJob.findFirst({
        where: {
          type: 'DAILY_CONTENT_GENERATION',
          status: { in: ['QUEUED', 'PROCESSING'] },
          payload: { path: ['websiteId'], equals: site.id }
        }
      });

      if (existingJob) {
        continue;
      }

      await QueueService.enqueue('DAILY_CONTENT_GENERATION', {
        websiteId: site.id,
        autoPublish: true
      });
      enqueuedCount++;
      console.log(`[ContentScheduler] Enqueued daily content generation job for website ${site.id} (${site.name || site.url})`);
    }

    return enqueuedCount;
  } catch (err: any) {
    console.error('[ContentScheduler] Error checking daily content jobs:', err?.message || err);
    return 0;
  }
}

