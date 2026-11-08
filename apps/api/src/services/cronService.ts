import prisma from '../lib/database';
import { QueueService } from './queue';
import { run as runDailyContentGeneration } from '../cron/runDailyContentGeneration';
import { run as runStaleBacklinkEnqueue } from '../cron/enqueueStaleBacklinks';
import { executeAutomaticBacklinkGeneration } from './backlinks/automaticBacklinkWorkflow';
import { verifyBacklink } from './backlinks/verifyBacklink';
import { generateArticle } from './aiContent';
import { randomUUID } from 'crypto';

export interface CronRunResult {
  success: boolean;
  timestamp: string;
  durationMs: number;
  contentGeneration: {
    successCount: number;
    publishedCount: number;
    skippedCount: number;
    failedCount: number;
  };
  backlinksProcessed: number;
  jobsProcessed: number;
  errors: string[];
}

/**
 * Processes up to maxJobs from the BackgroundJob queue.
 * Handles newly enqueued AUTOMATIC_BACKLINK_GENERATION, BACKLINK_VERIFICATION, and AI_ARTICLE_GENERATION.
 */
export async function drainBackgroundJobs(
  maxJobs: number = 15,
  workerId: string = `cron-${randomUUID()}`
): Promise<number> {
  let processed = 0;

  for (let i = 0; i < maxJobs; i++) {
    const job = await QueueService.claimJob(workerId);
    if (!job) break;

    try {
      switch (job.type) {
        case 'AUTOMATIC_BACKLINK_GENERATION': {
          if (job.payload?.websiteId) {
            await executeAutomaticBacklinkGeneration({
              websiteId: job.payload.websiteId,
              articleId: job.payload.articleId,
              topic: job.payload.topic,
              keyword: job.payload.keyword,
            });
          }
          break;
        }
        case 'BACKLINK_VERIFICATION': {
          if (job.payload?.backlinkId && job.payload.executionProvider !== 'trigger') {
            await verifyBacklink(job.payload.backlinkId);
          }
          break;
        }
        case 'AI_ARTICLE_GENERATION': {
          const targetJobId = job.payload?.jobId || job.payload?.aiJobId;
          if (targetJobId) {
            await generateArticle(targetJobId);
          }
          break;
        }
        default:
          console.log(`[CronService] Skipping non-cron job type: ${job.type}`);
      }

      await QueueService.completeJob(job.id);
      processed++;
    } catch (err: any) {
      console.error(`[CronService] Error processing job ${job.id}:`, err?.message || err);
      await QueueService.failJob(job.id, err?.message || 'Cron job execution failed');
    }
  }

  return processed;
}

/**
 * Master autonomous daily cron execution.
 * 1. Recovers any stale locked jobs.
 * 2. Runs daily content generation & CMS publishing for all automated websites.
 * 3. Immediately drains and processes newly enqueued backlink generation jobs.
 * 4. Evaluates and enqueues stale backlinks for verification.
 */
export async function executeDailyCron(): Promise<CronRunResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // 1. Recover stale locked jobs
  try {
    await QueueService.recoverStaleJobs();
  } catch (err: any) {
    errors.push(`Stale recovery error: ${err.message}`);
  }

  // 2. Run Daily Content Generation
  let contentSummary = { successCount: 0, publishedCount: 0, skippedCount: 0, failedCount: 0 };
  try {
    contentSummary = await runDailyContentGeneration();
  } catch (err: any) {
    errors.push(`Daily content error: ${err.message}`);
  }

  // 3. Drain pending background jobs (especially AUTOMATIC_BACKLINK_GENERATION created in step 2)
  let jobsProcessed = 0;
  try {
    jobsProcessed = await drainBackgroundJobs(15);
  } catch (err: any) {
    errors.push(`Job draining error: ${err.message}`);
  }

  // 4. Stale backlink evaluation
  try {
    await runStaleBacklinkEnqueue(50, 14);
  } catch (err: any) {
    errors.push(`Stale backlink error: ${err.message}`);
  }

  return {
    success: errors.length === 0,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    contentGeneration: contentSummary,
    backlinksProcessed: jobsProcessed,
    jobsProcessed,
    errors,
  };
}

