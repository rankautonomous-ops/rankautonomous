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

async function startPolling() {
  console.log(`[Worker ${WORKER_ID}] Started polling queue...`);

  // Recover any stale jobs on startup
  await QueueService.recoverStaleJobs();

  while (!isShuttingDown) {
    try {
      const job = await QueueService.claimJob(WORKER_ID);
      
      if (job) {
        await processJob(job);
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
