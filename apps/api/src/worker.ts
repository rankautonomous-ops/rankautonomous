import './lib/env'; // MUST be the first import to configure environment variables
import { QueueService } from './services/queue';
import { checkAndEnqueueDailyContentJobs } from './services/contentScheduler';
import { randomUUID } from 'crypto';

const WORKER_ID = `worker-${randomUUID()}`;
const POLL_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 500 : 5000;
let isShuttingDown = false;
let schedulerTimer: NodeJS.Timeout | null = null;

// Service imports for background worker
import { syncGoogleIntegrations } from './services/google';
import { startCrawl } from './services/crawler';
import { generateArticle } from './services/aiContent';
import { executeDailyContentGeneration } from './trigger/dailyContentGeneration';

import prisma from './lib/database';
import { verifyBacklink } from './services/backlinks/verifyBacklink';
import { executeAutomaticBacklinkGeneration } from './services/backlinks/automaticBacklinkWorkflow';
import { run as runStaleBacklinkEnqueue } from './cron/enqueueStaleBacklinks';

export { checkAndEnqueueDailyContentJobs };

async function processJob(job: any) {
  console.log(`[Worker ${WORKER_ID}] Processing job ${job.id} of type ${job.type}`);

  try {
    switch (job.type) {
      case 'GOOGLE_SYNC': {
        const { websiteId, userId } = job.payload || {};
        if (!websiteId || !userId) {
          console.warn(`[Worker ${WORKER_ID}] Malformed payload for GOOGLE_SYNC. Missing websiteId or userId.`);
          break;
        }
        console.log(`[Worker ${WORKER_ID}] Executing GOOGLE_SYNC for website ${websiteId}`);
        await syncGoogleIntegrations(websiteId, userId);
        break;
      }
      case 'SEO_CRAWL': {
        const { websiteId, crawlJobId, startUrl } = job.payload || {};
        if (!websiteId || !crawlJobId || !startUrl) {
          console.warn(`[Worker ${WORKER_ID}] Malformed payload for SEO_CRAWL. Missing required fields.`);
          break;
        }
        console.log(`[Worker ${WORKER_ID}] Executing SEO_CRAWL for website ${websiteId}, job ${crawlJobId}`);
        await startCrawl(websiteId, crawlJobId, startUrl);
        break;
      }
      case 'AI_ARTICLE_GENERATION': {
        const targetJobId = job.payload?.jobId || job.payload?.aiJobId;
        if (!targetJobId && !job.payload?.articleId) {
          console.warn(`[Worker ${WORKER_ID}] Malformed payload for AI_ARTICLE_GENERATION. Missing jobId or articleId.`);
          break;
        }

        if (targetJobId) {
          console.log(`[Worker ${WORKER_ID}] Executing AI_ARTICLE_GENERATION for AiJob ${targetJobId}`);
          await generateArticle(targetJobId);
        } else if (job.payload?.articleId) {
          console.log(`[Worker ${WORKER_ID}] Executing AI_ARTICLE_GENERATION for Article ${job.payload.articleId}`);
          const article = await prisma.article.findUnique({
            where: { id: job.payload.articleId },
            include: { website: true }
          });

          if (!article || !article.website) {
            console.warn(`[Worker ${WORKER_ID}] Article ${job.payload.articleId} not found or lacks website. Skipping.`);
            break;
          }

          let aiJob = article.generationJobId
            ? await prisma.aiJob.findUnique({ where: { id: article.generationJobId } })
            : null;

          if (!aiJob) {
            aiJob = await prisma.aiJob.create({
              data: {
                userId: article.website.userId,
                websiteId: article.website.id,
                type: 'GENERATE_ARTICLE',
                payload: { articleId: article.id }
              }
            });
            await prisma.article.update({
              where: { id: article.id },
              data: { generationJobId: aiJob.id, status: 'GENERATING' }
            });
          }

          await generateArticle(aiJob.id);
        }
        break;
      }
      case 'DAILY_CONTENT_GENERATION': {
        if (!job.payload || typeof job.payload.websiteId !== 'string') {
          console.warn(`[Worker ${WORKER_ID}] Malformed payload for DAILY_CONTENT_GENERATION. Skipping.`);
          break;
        }
        console.log(`[Worker ${WORKER_ID}] Executing DAILY_CONTENT_GENERATION for website ${job.payload.websiteId}`);
        const result = await executeDailyContentGeneration({
          websiteId: job.payload.websiteId,
          autoPublish: job.payload.autoPublish !== false,
          force: job.payload.force === true
        });
        console.log(`[Worker ${WORKER_ID}] DAILY_CONTENT_GENERATION completed for website ${job.payload.websiteId}:`, result);
        break;
      }
      case 'AUTOMATIC_BACKLINK_GENERATION': {
        if (!job.payload || typeof job.payload.websiteId !== 'string') {
          console.warn(`[Worker ${WORKER_ID}] Malformed payload for AUTOMATIC_BACKLINK_GENERATION. Skipping.`);
          break;
        }
        console.log(`[Worker ${WORKER_ID}] Executing AUTOMATIC_BACKLINK_GENERATION for website ${job.payload.websiteId}`);
        const result = await executeAutomaticBacklinkGeneration({
          websiteId: job.payload.websiteId,
          articleId: job.payload.articleId,
          topic: job.payload.topic,
          keyword: job.payload.keyword
        });
        console.log(`[Worker ${WORKER_ID}] AUTOMATIC_BACKLINK_GENERATION completed for website ${job.payload.websiteId}:`, result);
        break;
      }
      case 'BACKLINK_VERIFICATION':
        if (!job.payload || typeof job.payload.backlinkId !== 'string') {
          console.warn(`[Worker ${WORKER_ID}] Malformed payload for BACKLINK_VERIFICATION. Skipping.`);
          break; // Proceed to complete the job to drop it
        }

        if (job.payload.executionProvider === 'trigger') {
          console.warn(`[Worker ${WORKER_ID}] Job ${job.id} is owned by Trigger.dev. Skipping.`);
          return; // Do not process or complete; owned by Trigger.dev
        }

        // Tenant & Stale Job Safety
        const backlink = await prisma.backlink.findUnique({
          where: { id: job.payload.backlinkId },
          include: { website: true }
        });

        if (!backlink || !backlink.website || !backlink.website.userId) {
          console.warn(`[Worker ${WORKER_ID}] Backlink ${job.payload.backlinkId} missing or lacks valid tenant. Skipping.`);
          break; // Proceed to complete the job to drop it
        }

        await verifyBacklink(job.payload.backlinkId);
        console.log(`Executing BACKLINK_VERIFICATION for backlink ${job.payload.backlinkId}`);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    await QueueService.completeJob(job.id);
    console.log(`[Worker ${WORKER_ID}] Successfully completed job ${job.id}`);
  } catch (error: any) {
    console.error(`[Worker ${WORKER_ID}] Failed to process job ${job.id}:`, error);
    await QueueService.failJob(job.id, error.message || 'Unknown error');
  }
}

let rawConcurrency = parseInt(process.env.BACKLINK_WORKER_CONCURRENCY || '5', 10);
if (isNaN(rawConcurrency) || rawConcurrency < 1) {
  rawConcurrency = 5;
}
const WORKER_CONCURRENCY = Math.min(rawConcurrency, 50);

const activeJobs = new Set<Promise<void>>();

async function startPolling() {
  console.log(`[Worker ${WORKER_ID}] Started polling queue with concurrency ${WORKER_CONCURRENCY}...`);

  // Recover any stale jobs on startup
  await QueueService.recoverStaleJobs();

  // Run initial scheduler check for daily content publishing & stale backlinks in non-test environments
  if (process.env.NODE_ENV !== 'test' && !process.argv.some(a => a.includes('test'))) {
    await checkAndEnqueueDailyContentJobs();
    await runStaleBacklinkEnqueue(50, 14).catch((err) => {
      console.error('[Worker Scheduler] Initial stale backlink enqueue error:', err?.message || err);
    });

    // Recurring scheduler check every 30 minutes
    const SCHEDULER_INTERVAL_MS = 30 * 60 * 1000;
    schedulerTimer = setInterval(() => {
      if (!isShuttingDown) {
        checkAndEnqueueDailyContentJobs().catch((err) => {
          console.error('[Worker Scheduler] Interval error in daily content jobs:', err?.message || err);
        });
        runStaleBacklinkEnqueue(50, 14).catch((err) => {
          console.error('[Worker Scheduler] Interval error in stale backlink enqueue:', err?.message || err);
        });
      }
    }, SCHEDULER_INTERVAL_MS);

    if (schedulerTimer.unref) {
      schedulerTimer.unref();
    }
  }

  while (!isShuttingDown) {
    if (activeJobs.size >= WORKER_CONCURRENCY) {
      // Wait for at least one job to finish before trying to claim another
      await Promise.race(activeJobs);
      continue;
    }

    try {
      const job = await QueueService.claimJob(WORKER_ID);

      if (job) {
        const jobPromise = processJob(job).catch(err => {
          console.error(`[Worker ${WORKER_ID}] Unhandled exception in job wrapper:`, err);
        }).finally(() => {
          activeJobs.delete(jobPromise);
        });

        activeJobs.add(jobPromise);
      } else {
        // No jobs available, wait before polling again
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error(`[Worker ${WORKER_ID}] Error in polling loop:`, error);
      // Wait before retrying to prevent rapid failure loops
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  // Graceful shutdown: drain active jobs
  if (activeJobs.size > 0) {
    console.log(`[Worker ${WORKER_ID}] Waiting for ${activeJobs.size} active jobs to complete before shutting down...`);
    await Promise.allSettled(Array.from(activeJobs));
  }

  console.log(`[Worker ${WORKER_ID}] Polling loop stopped.`);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down worker gracefully...');
  isShuttingDown = true;
  if (schedulerTimer) clearInterval(schedulerTimer);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down worker gracefully...');
  isShuttingDown = true;
  if (schedulerTimer) clearInterval(schedulerTimer);
});

// Start the worker
startPolling();
