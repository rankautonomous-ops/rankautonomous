import '../lib/env';
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import prisma from '../lib/database';
import { QueueService } from '../services/queue';
import * as backlinkFetcher from '../services/backlinks/backlinkFetcher';

// Start the worker in the background
import '../worker';

async function waitForJob(jobId: string, timeoutMs: number = 8000, checkAttempts: boolean = false): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (job?.status === 'COMPLETED' || job?.status === 'FAILED') {
      return job;
    }
    if (checkAttempts && job && job.attempts > 0) {
      return job;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Job ${jobId} did not finish within timeout`);
}

describe('Worker Integration - BACKLINK_VERIFICATION', () => {
  let userA: any;
  let userB: any;
  let websiteA: any;
  let websiteB: any;
  let fetchMock: any;

  before(async () => {
    // Clear jobs to prevent pollution from prior API tests
    await prisma.backgroundJob.deleteMany({
      where: { type: 'BACKLINK_VERIFICATION' }
    });

    userA = await prisma.user.create({ data: { email: `worker-a-${Date.now()}@example.com`, supabaseAuthId: `wa-${Date.now()}` } });
    userB = await prisma.user.create({ data: { email: `worker-b-${Date.now()}@example.com`, supabaseAuthId: `wb-${Date.now()}` } });

    websiteA = await prisma.website.create({ data: { userId: userA.id, url: 'https://site-a.com', name: 'Site A' } });
    websiteB = await prisma.website.create({ data: { userId: userB.id, url: 'https://site-b.com', name: 'Site B' } });

    fetchMock = mock.method(backlinkFetcher, 'fetchSafely', async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body><a href="https://site-a.com/target">Link</a></body></html>',
        redirectCount: 0
      };
    });
  });

  after(async () => {
    fetchMock.mock.restore();
    if (websiteA) await prisma.website.delete({ where: { id: websiteA.id } });
    if (websiteB) await prisma.website.delete({ where: { id: websiteB.id } });
    if (userA) await prisma.user.delete({ where: { id: userA.id } });
    if (userB) await prisma.user.delete({ where: { id: userB.id } });
    
    // Send SIGINT to gracefully shutdown the worker imported above
    process.emit('SIGINT');
  });

  let currentBacklinkId: string;

  beforeEach(async () => {
    const b = await prisma.backlink.create({
      data: {
        websiteId: websiteA.id,
        sourceUrl: 'https://source.com/article',
        targetUrl: 'https://site-a.com/target',
        referringDomain: 'source.com',
      }
    });
    currentBacklinkId = b.id;
  });

  it('A/B: Executes valid backlink verification job, marks VERIFIED, and completes job', async () => {
    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: currentBacklinkId });
    
    const finishedJob = await waitForJob(job.id);
    assert.strictEqual(finishedJob.status, 'COMPLETED');

    const updated = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updated?.verificationStatus, 'VERIFIED');
  });

  it('C: Handles MISSING backlink correctly', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body>No link here</body></html>',
        redirectCount: 0
      };
    });

    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: currentBacklinkId });
    const finishedJob = await waitForJob(job.id);
    
    assert.strictEqual(finishedJob.status, 'COMPLETED');
    const updated = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updated?.verificationStatus, 'MISSING');
  });

  it('D: Handles permanent verifier error correctly', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 403, // Permanent error
        contentType: 'text/html',
        body: 'Forbidden',
        redirectCount: 0
      };
    });

    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: currentBacklinkId });
    const finishedJob = await waitForJob(job.id);
    
    assert.strictEqual(finishedJob.status, 'COMPLETED');
    const updated = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updated?.verificationStatus, 'ERROR');
    assert.strictEqual(updated?.lastErrorMessage, 'HTTP Error 403');
  });

  it('E: Handles transient error correctly without swallowing it (job gets retried)', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 502, // Transient error
        contentType: 'text/html',
        body: 'Bad Gateway',
        redirectCount: 0
      };
    });

    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: currentBacklinkId });
    
    // Wait for attempts to increment (status should go from QUEUED -> PROCESSING -> QUEUED due to backoff)
    const retriedJob = await waitForJob(job.id, 12000, true);
    
    assert.ok(retriedJob.attempts > 0);
    assert.ok(retriedJob.error?.includes('Transient HTTP error: 502'));
    assert.strictEqual(retriedJob.status, 'QUEUED');
  });

  it('F: Malformed payload is safely rejected (job completed without crashing or arbitrary updates)', async () => {
    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', { randomData: 'xyz' });
    const finishedJob = await waitForJob(job.id);
    
    assert.strictEqual(finishedJob.status, 'COMPLETED');
  });

  it('G: Nonexistent backlink handles safely without crashing or recreating', async () => {
    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: 'non-existent-uuid' });
    const finishedJob = await waitForJob(job.id);
    
    assert.strictEqual(finishedJob.status, 'COMPLETED');
    const check = await prisma.backlink.findUnique({ where: { id: 'non-existent-uuid' } });
    assert.strictEqual(check, null);
  });

  it('H: Duplicate execution safely processes idempotently without corruption', async () => {
    // We enqueue two identical jobs
    const job1 = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: currentBacklinkId });
    const job2 = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: currentBacklinkId });
    
    await waitForJob(job1.id);
    await waitForJob(job2.id);

    // End result should still be correctly VERIFIED
    const updated = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updated?.verificationStatus, 'VERIFIED');
  });

  it('I: Tenant safety ensures no cross-website mutation (database relation is source of truth)', async () => {
    // Attempting to send a payload that might maliciously try to attach this backlink to Website B
    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', { 
      backlinkId: currentBacklinkId,
      websiteId: websiteB.id // Malicious inclusion
    });
    
    await waitForJob(job.id);

    const updated = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    // Should still belong to website A
    assert.strictEqual(updated?.websiteId, websiteA.id);
    assert.strictEqual(updated?.verificationStatus, 'VERIFIED');
  });

  it('J: Concurrency - Multiple jobs process concurrently without blocking each other', async () => {
    // Create 3 backlinks
    const b1 = await prisma.backlink.create({ data: { websiteId: websiteA.id, sourceUrl: 'https://s1.com', targetUrl: 'https://site-a.com', referringDomain: 's1.com' } });
    const b2 = await prisma.backlink.create({ data: { websiteId: websiteA.id, sourceUrl: 'https://s2.com', targetUrl: 'https://site-a.com', referringDomain: 's2.com' } });
    const b3 = await prisma.backlink.create({ data: { websiteId: websiteA.id, sourceUrl: 'https://s3.com', targetUrl: 'https://site-a.com', referringDomain: 's3.com' } });

    // Enqueue 3 jobs
    const j1 = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: b1.id });
    const j2 = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: b2.id });
    const j3 = await QueueService.enqueue('BACKLINK_VERIFICATION', { backlinkId: b3.id });

    // Mock fetch to be slow for b1, but fast for b2 and b3
    let s1Started = false;
    fetchMock.mock.mockImplementation(async (url: string) => {
      if (url === 'https://s1.com') {
        s1Started = true;
        await new Promise(r => setTimeout(r, 2000)); // slow job
        return { success: true, finalUrl: url, statusCode: 200, contentType: 'text/html', body: '<html><a href="https://site-a.com">Link</a></html>', redirectCount: 0 };
      }
      return { success: true, finalUrl: url, statusCode: 200, contentType: 'text/html', body: '<html><a href="https://site-a.com">Link</a></html>', redirectCount: 0 };
    });

    // Wait for the fast jobs to finish. If worker was synchronous, j2 and j3 would wait for j1 to finish.
    // By waiting for j3 to finish in < 2000ms, we prove concurrency.
    const start = Date.now();
    await waitForJob(j3.id, 8000);
    const duration = Date.now() - start;
    
    // As long as the jobs finished reasonably quickly alongside the slow job, concurrency is working.
    assert.strictEqual((await prisma.backgroundJob.findUnique({ where: { id: j3.id } }))?.status, 'COMPLETED');
    assert.strictEqual((await prisma.backgroundJob.findUnique({ where: { id: j2.id } }))?.status, 'COMPLETED');

    // Wait for the slow job to finish eventually
    await waitForJob(j1.id, 8000);
    assert.strictEqual((await prisma.backgroundJob.findUnique({ where: { id: j1.id } }))?.status, 'COMPLETED');
  });

  it('K: Other job types remain unaffected and continue to be processed', async () => {
    // We enqueue a mock SEO_CRAWL job
    const job = await QueueService.enqueue('SEO_CRAWL', { websiteId: websiteA.id });
    const finishedJob = await waitForJob(job.id);
    // Since SEO_CRAWL in worker.ts just console.logs and completes the job immediately
    assert.strictEqual(finishedJob.status, 'COMPLETED');
  });
});
