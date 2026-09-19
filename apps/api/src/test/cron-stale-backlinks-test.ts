import '../lib/env';
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import prisma from '../lib/database';
import { run } from '../cron/enqueueStaleBacklinks';

describe('Cron: enqueueStaleBacklinks', () => {
  let user: any;
  let website: any;

  const cleanup = async () => {
    if (website) {
      await prisma.backgroundJob.deleteMany({
        where: { payload: { equals: { backlinkId: { in: [] } } } } // We'll clean up jobs manually by fetching them
      });
      // Actually a safer way is to just delete the user, and cascade delete handles website, backlink, and jobs? 
      // BackgroundJob doesn't cascade, so we must clean it up.
      const jobs = await prisma.backgroundJob.findMany({ where: { type: 'BACKLINK_VERIFICATION' } });
      for (const j of jobs) {
        if ((j.payload as any)?.backlinkId) {
          const bl = await prisma.backlink.findUnique({ where: { id: (j.payload as any).backlinkId } });
          if (bl?.websiteId === website?.id || !bl) {
            await prisma.backgroundJob.delete({ where: { id: j.id } });
          }
        }
      }
      
      await prisma.backlink.deleteMany({ where: { websiteId: website.id } });
      await prisma.website.deleteMany({ where: { id: website.id } });
    }
    if (user) {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  };

  before(async () => {
    await cleanup();
    user = await prisma.user.create({
      data: {
        id: 'test-user-cron-1',
        email: 'cron1@test.com',
        role: 'CUSTOMER',
        supabaseAuthId: 'cron-supa-1',
        name: 'Test 1',
      }
    });

    website = await prisma.website.create({
      data: {
        id: 'test-web-cron-1',
        userId: user.id,
        url: 'https://testcron.com',
        name: 'Cron Test',
        status: 'ACTIVE'
      }
    });
  });

  beforeEach(async () => {
    await prisma.backlink.deleteMany({ where: { websiteId: website.id } });
    const jobs = await prisma.backgroundJob.findMany({ where: { type: 'BACKLINK_VERIFICATION' } });
    for (const j of jobs) {
      await prisma.backgroundJob.delete({ where: { id: j.id } });
    }
  });

  after(async () => {
    await cleanup();
  });

  const createBacklink = async (verificationStatus: any, lastChecked: Date | null) => {
    return prisma.backlink.create({
      data: {
        websiteId: website.id,
        sourceUrl: 'https://source.com/page-' + Date.now() + Math.random(),
        targetUrl: 'https://testcron.com',
        referringDomain: 'source.com',
        verificationStatus,
        lastChecked: lastChecked || new Date(),
      }
    });
  };

  const getJobsForBacklink = async (id: string) => {
    const all = await prisma.backgroundJob.findMany({ where: { type: 'BACKLINK_VERIFICATION' } });
    return all.filter((j: any) => j.payload?.backlinkId === id);
  };

  const getJobsForBacklinks = async (ids: string[]) => {
    const all = await prisma.backgroundJob.findMany({ where: { type: 'BACKLINK_VERIFICATION' } });
    return all.filter((j: any) => ids.includes(j.payload?.backlinkId));
  };

  it('selects UNVERIFIED backlink', async () => {
    const bl = await createBacklink('UNVERIFIED', new Date());
    
    await run();

    const jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 1);
    const payload = jobs[0].payload as any;
    assert.strictEqual(payload.backlinkId, bl.id);
    assert.strictEqual(jobs[0].status, 'QUEUED');
    
    // nextRunAt jitter for UNVERIFIED should be within 1 hour
    const maxAllowed = new Date(Date.now() + 61 * 60 * 1000); // +61 mins for buffer
    assert.ok(jobs[0].nextRunAt.getTime() <= maxAllowed.getTime());
  });

  it('selects VERIFIED backlink older than 14 days', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 15);
    const bl = await createBacklink('VERIFIED', oldDate);
    
    await run();

    const jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 1);
    const payload = jobs[0].payload as any;
    assert.strictEqual(payload.backlinkId, bl.id);
  });

  it('skips VERIFIED backlink newer than 14 days', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2);
    const bl = await createBacklink('VERIFIED', recentDate);
    
    await run();

    const jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 0);
  });

  it('selects MISSING and ERROR backlinks older than 14 days', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 15);
    
    const missingBl = await createBacklink('MISSING', oldDate);
    const errorBl = await createBacklink('ERROR', oldDate);
    
    await run();

    const jobs = await getJobsForBacklinks([missingBl.id, errorBl.id]);
    assert.strictEqual(jobs.length, 2);
    const queuedIds = jobs.map((j: any) => j.payload.backlinkId);
    assert.ok(queuedIds.includes(missingBl.id));
    assert.ok(queuedIds.includes(errorBl.id));
  });

  it('prevents duplicate if existing job is QUEUED or PROCESSING', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 15);
    const bl = await createBacklink('VERIFIED', oldDate);
    
    // First run creates it
    await run();
    
    let jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 1);

    // Second run should skip it
    await run();
    
    jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 1); // Still 1

    // Update status to PROCESSING
    await prisma.backgroundJob.update({
      where: { id: jobs[0].id },
      data: { status: 'PROCESSING' }
    });

    // Third run should skip it
    await run();
    jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 1); // Still 1
  });

  it('allows new job if previous job was COMPLETED', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 15);
    const bl = await createBacklink('VERIFIED', oldDate);
    
    await run();
    let jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 1);

    // Update status to COMPLETED
    await prisma.backgroundJob.update({
      where: { id: jobs[0].id },
      data: { status: 'COMPLETED' }
    });

    // Run again - since it's COMPLETED, we should be able to queue another if the backlink is still stale
    await run();
    jobs = await getJobsForBacklink(bl.id);
    assert.strictEqual(jobs.length, 2); // New job added
  });

  it('respects BATCH_SIZE (defaults to 500 but we test with small dataset)', async () => {
    process.env.BACKLINK_VERIFICATION_BATCH_SIZE = '2';
    
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 15);
    
    const bl1 = await createBacklink('VERIFIED', oldDate);
    const bl2 = await createBacklink('MISSING', oldDate);
    const bl3 = await createBacklink('ERROR', oldDate);

    await run();
    
    const jobs = await getJobsForBacklinks([bl1.id, bl2.id, bl3.id]);
    assert.strictEqual(jobs.length, 2); // Only 2 were queued because batch size is 2
    
    // Reset to normal
    process.env.BACKLINK_VERIFICATION_BATCH_SIZE = '500';
  });
});
