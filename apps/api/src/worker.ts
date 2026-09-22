import './lib/env'; // MUST be the first import to configure environment variables
import { QueueService } from './services/queue';
import { randomUUID } from 'crypto';

const WORKER_ID = `worker-${randomUUID()}`;
const POLL_INTERVAL_MS = 5000;
let isShuttingDown = false;

// Mock imports for existing services (these would be hooked up properly in later phases)
// import { syncGoogleIntegrations } from './services/google';
// import { startCrawl } from './services/crawler';
// import { generateArticle } from './services/aiContent';

import prisma from './lib/database';
import { verifyBacklink } from './services/backlinks/verifyBacklink';

async function processJob(job: any) {
  console.log(`[Worker ${WORKER_ID}] Processing job ${job.id} of type ${job.type}`);
  
  try {
    switch (job.type) {
      case 'GOOGLE_SYNC':
        // await syncGoogleIntegrations(job.payload.websiteId, job.payload.userId);
        console.log(`Executing GOOGLE_SYNC for website ${job.payload.websiteId}`);
        break;
      case 'SEO_CRAWL':
        // await startCrawl(job.payload.websiteId, job.payload.crawlJobId, job.payload.startUrl);
        console.log(`Executing SEO_CRAWL for website ${job.payload.websiteId}`);
        break;
      case 'AI_ARTICLE_GENERATION':
        // await generateArticle(job.payload.jobId);
        console.log(`Executing AI_ARTICLE_GENERATION for job ${job.payload.jobId}`);
        break;
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
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down worker gracefully...');
  isShuttingDown = true;
});

// Start the worker
startPolling();
