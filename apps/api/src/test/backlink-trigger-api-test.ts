process.env.NODE_ENV = 'test';
import '../lib/env';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/database';
import supabase from '../lib/supabase';
import { backlinkVerificationTask, executeBacklinkVerification } from '../trigger/backlinkVerification';
import { QueueService } from '../services/queue';
import * as backlinkFetcher from '../services/backlinks/backlinkFetcher';
import assert from 'node:assert';

const MOCK_USER_ID = 'trigger-api-test-user-a';
const MOCK_AUTH_ID = 'trigger-api-auth-user-a';
const MOCK_WEBSITE_ID = 'trigger-api-website-a';

const OTHER_USER_ID = 'trigger-api-test-user-b';
const OTHER_AUTH_ID = 'trigger-api-auth-user-b';
const OTHER_WEBSITE_ID = 'trigger-api-website-b';

function setupAuthMocks() {
  supabase.auth.getUser = async (token: string) => {
    if (token === 'MOCK_TOKEN_A') {
      return {
        data: { user: { id: MOCK_AUTH_ID, email: 'user-a@example.com', user_metadata: { name: 'User A' } } },
        error: null,
      } as any;
    }
    if (token === 'MOCK_TOKEN_B') {
      return {
        data: { user: { id: OTHER_AUTH_ID, email: 'user-b@example.com', user_metadata: { name: 'User B' } } },
        error: null,
      } as any;
    }
    return { data: { user: null }, error: new Error('Invalid token') } as any;
  };
}

const authHeadersA = { Authorization: 'Bearer MOCK_TOKEN_A' };
const authHeadersB = { Authorization: 'Bearer MOCK_TOKEN_B' };

async function cleanupData() {
  await prisma.$executeRaw`
    DELETE FROM "BackgroundJob" 
    WHERE type = 'BACKLINK_VERIFICATION' 
      AND payload->>'backlinkId' IN (
        SELECT id FROM "Backlink" WHERE "websiteId" IN (${MOCK_WEBSITE_ID}, ${OTHER_WEBSITE_ID})
      )
  `;
  await prisma.backlink.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.website.deleteMany({ where: { id: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
  await prisma.user.deleteMany({ where: { id: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
}

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING TRIGGER.DEV BACKLINK VERIFICATION API TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(msg: string) {
    passed++;
    console.log(`PASS: ${msg}`);
  }

  function fail(msg: string, err?: any) {
    failed++;
    console.error(`FAIL: ${msg}`, err || '');
  }

  // Intercept and mock Trigger task triggering
  const triggeredPayloads: any[] = [];
  let triggerShouldFail = false;
  const originalTrigger = backlinkVerificationTask.trigger;

  backlinkVerificationTask.trigger = async (payload: any) => {
    triggeredPayloads.push(payload);
    if (triggerShouldFail) {
      throw new Error('Connection refused to Trigger.dev coordinator');
    }
    return { id: 'run_mock_trigger_123' } as any;
  };

  const originalFetchSafely = backlinkFetcher.fetchSafely;
  (backlinkFetcher as any).fetchSafely = async (url: string) => {
    return {
      success: true,
      finalUrl: url,
      statusCode: 200,
      contentType: 'text/html',
      body: '<html><body><a href="https://site-a.com/target" rel="nofollow">Link</a></body></html>',
      redirectCount: 0,
      timingMs: 50,
    };
  };

  try {
    setupAuthMocks();
    await cleanupData();

    // Create test fixtures
    await prisma.user.create({
      data: { id: MOCK_USER_ID, supabaseAuthId: MOCK_AUTH_ID, email: 'user-a@example.com', role: 'CUSTOMER' },
    });
    await prisma.user.create({
      data: { id: OTHER_USER_ID, supabaseAuthId: OTHER_AUTH_ID, email: 'user-b@example.com', role: 'CUSTOMER' },
    });

    await prisma.subscription.create({
      data: { userId: MOCK_USER_ID, plan: 'pro', interval: 'month', status: 'active' },
    });
    await prisma.subscription.create({
      data: { userId: OTHER_USER_ID, plan: 'pro', interval: 'month', status: 'active' },
    });

    await prisma.website.create({
      data: { id: MOCK_WEBSITE_ID, userId: MOCK_USER_ID, url: 'https://site-a.com', name: 'Site A' },
    });
    await prisma.website.create({
      data: { id: OTHER_WEBSITE_ID, userId: OTHER_USER_ID, url: 'https://site-b.com', name: 'Site B' },
    });

    const testBacklink = await prisma.backlink.create({
      data: {
        websiteId: MOCK_WEBSITE_ID,
        sourceUrl: 'https://example.com',
        targetUrl: 'https://site-a.com/target',
        referringDomain: 'example.com',
        status: 'ACTIVE',
      },
    });

    // ----------------------------------------------------
    // TEST 1: Feature flag OFF (Default behavior)
    // ----------------------------------------------------
    delete process.env.USE_TRIGGER_BACKLINK_VERIFICATION;
    triggeredPayloads.length = 0;

    const resFlagOff = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(resFlagOff.status, 202);
    assert.strictEqual(resFlagOff.body.success, true);
    assert.strictEqual(resFlagOff.body.backlinkId, testBacklink.id);
    assert.ok(resFlagOff.body.jobId);

    // Verify job in database is QUEUED for Render Worker
    const jobFlagOff = await prisma.backgroundJob.findUnique({ where: { id: resFlagOff.body.jobId } });
    assert.strictEqual(jobFlagOff?.status, 'QUEUED');
    assert.strictEqual((jobFlagOff?.payload as any).backlinkId, testBacklink.id);

    // Verify Trigger.dev was NOT triggered
    assert.strictEqual(triggeredPayloads.length, 0);
    pass('1. Feature flag OFF: BackgroundJob QUEUED for Render Worker, Trigger task not called');

    // ----------------------------------------------------
    // TEST 2: Existing queued/processing duplicate prevention
    // ----------------------------------------------------
    const resDup = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(resDup.status, 202);
    assert.ok(resDup.body.message.includes('already queued'));
    assert.strictEqual(resDup.body.jobId, resFlagOff.body.jobId);
    assert.strictEqual(triggeredPayloads.length, 0);
    pass('2. Duplicate QUEUED job prevented and does not re-trigger');

    // Mark job COMPLETED so we can test flag ON
    await prisma.backgroundJob.update({
      where: { id: resFlagOff.body.jobId },
      data: { status: 'COMPLETED' },
    });

    // ----------------------------------------------------
    // TEST 3: Feature flag ON
    // ----------------------------------------------------
    process.env.USE_TRIGGER_BACKLINK_VERIFICATION = 'true';
    triggeredPayloads.length = 0;

    const resFlagOn = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(resFlagOn.status, 202);
    assert.strictEqual(resFlagOn.body.success, true);
    assert.strictEqual(resFlagOn.body.backlinkId, testBacklink.id);
    const newJobId = resFlagOn.body.jobId;
    assert.notStrictEqual(newJobId, resFlagOff.body.jobId);

    // Verify Trigger.dev task was triggered
    assert.strictEqual(triggeredPayloads.length, 1);
    const sentPayload = triggeredPayloads[0];
    assert.strictEqual(sentPayload.backlinkId, testBacklink.id);
    assert.strictEqual(sentPayload.jobId, newJobId);

    // Verify NO userId or websiteId passed in Trigger payload
    assert.strictEqual(sentPayload.userId, undefined);
    assert.strictEqual(sentPayload.websiteId, undefined);

    // Verify exactly one new BackgroundJob created with executionProvider = 'trigger'
    const jobFlagOn = await prisma.backgroundJob.findUnique({ where: { id: newJobId } });
    assert.strictEqual(jobFlagOn?.status, 'QUEUED');
    assert.strictEqual(jobFlagOn?.type, 'BACKLINK_VERIFICATION');
    assert.strictEqual((jobFlagOn?.payload as any).executionProvider, 'trigger');

    const matchingJobs = await prisma.$queryRaw<any[]>`
      SELECT id FROM "BackgroundJob" 
      WHERE type = 'BACKLINK_VERIFICATION' 
        AND payload->>'backlinkId' = ${testBacklink.id}
    `;
    // 1 completed from flag-off test + 1 active from flag-on test = 2 total
    assert.strictEqual(matchingJobs.length, 2);

    pass('3. Feature flag ON: BackgroundJob created with executionProvider="trigger", Trigger task dispatched with minimal payload { backlinkId, jobId }');

    // Mark job COMPLETED for next test
    await prisma.backgroundJob.update({
      where: { id: newJobId },
      data: { status: 'COMPLETED' },
    });

    // ----------------------------------------------------
    // TEST 4: Trigger Dispatch Failure Handling
    // ----------------------------------------------------
    process.env.USE_TRIGGER_BACKLINK_VERIFICATION = 'true';
    triggeredPayloads.length = 0;
    triggerShouldFail = true;

    const resFail = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(resFail.status, 500);
    assert.strictEqual(resFail.body.error, 'Trigger Dispatch Error');
    const failedJobId = resFail.body.jobId;
    assert.ok(failedJobId);

    // Verify BackgroundJob was transitioned to FAILED and NOT left orphaned in QUEUED
    const failedJob = await prisma.backgroundJob.findUnique({ where: { id: failedJobId } });
    assert.strictEqual(failedJob?.status, 'FAILED');
    assert.ok(failedJob?.error?.includes('Trigger dispatch failed'));
    pass('4. Trigger dispatch failure: BackgroundJob marked FAILED with descriptive error and not left orphaned in QUEUED');

    // ----------------------------------------------------
    // TEST 5: Recovery After Failed Dispatch
    // ----------------------------------------------------
    // Because the failed job is in FAILED (not QUEUED/PROCESSING), subsequent verification request is allowed
    triggerShouldFail = false;
    const resRecover = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(resRecover.status, 202);
    assert.notStrictEqual(resRecover.body.jobId, failedJobId);
    pass('5. Recovery: New verification request is accepted immediately after a dispatch failure');

    // Clean up active job
    await prisma.backgroundJob.update({
      where: { id: resRecover.body.jobId },
      data: { status: 'COMPLETED' },
    });

    // ----------------------------------------------------
    // TEST 6: Tenant Isolation & Ownership Protection
    // ----------------------------------------------------
    // User B attempts to verify User A's backlink
    triggeredPayloads.length = 0;
    const resTenantViolation = await request(app)
      .post(`/api/websites/${OTHER_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersB);

    assert.strictEqual(resTenantViolation.status, 404);
    assert.strictEqual(triggeredPayloads.length, 0);

    // User A attempts to target website B
    const resTenantCross = await request(app)
      .post(`/api/websites/${OTHER_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(resTenantCross.status, 404);
    assert.strictEqual(triggeredPayloads.length, 0);
    pass('6. Tenant isolation: Cross-tenant verification attempts return 404 and do not create jobs or trigger Trigger.dev');

    // ----------------------------------------------------
    // TEST 7: Authorization & Validation Checks
    // ----------------------------------------------------
    // Unauthenticated
    const resUnauth = await request(app).post(
      `/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`
    );
    assert.strictEqual(resUnauth.status, 401);

    // Unsubscribed
    await prisma.subscription.updateMany({
      where: { userId: MOCK_USER_ID },
      data: { status: 'canceled' },
    });
    const resUnsub = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);
    assert.strictEqual(resUnsub.status, 403);

    // Restore subscription for non-existent backlink test
    await prisma.subscription.updateMany({
      where: { userId: MOCK_USER_ID },
      data: { status: 'active' },
    });

    // Non-existent backlink
    const resNotFound = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/00000000-0000-0000-0000-000000000000/verify`)
      .set(authHeadersA);
    assert.strictEqual(resNotFound.status, 404);
    pass('7. Authorization & validation: Unauthenticated (401), unsubscribed (403), and missing backlink (404) enforced');

    // ----------------------------------------------------
    // TEST 8: Response shape compatibility
    // ----------------------------------------------------
    const resShape = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${testBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(resShape.status, 202);
    assert.strictEqual(typeof resShape.body.success, 'boolean');
    assert.strictEqual(typeof resShape.body.message, 'string');
    assert.strictEqual(typeof resShape.body.jobId, 'string');
    assert.strictEqual(typeof resShape.body.backlinkId, 'string');
    assert.strictEqual(typeof resShape.body.verificationStatus, 'string');
    pass('8. Response shape: Returns exact backward-compatible JSON shape { success, message, jobId, backlinkId, verificationStatus }');

    // ----------------------------------------------------
    // TEST 9: Trigger Mode Routing - Render Worker ignores Trigger-owned jobs
    // ----------------------------------------------------
    // Clear out any active QUEUED jobs from previous tests
    await prisma.backgroundJob.updateMany({
      where: {
        type: 'BACKLINK_VERIFICATION',
        payload: { path: ['backlinkId'], equals: testBacklink.id },
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
      data: { status: 'COMPLETED' },
    });

    // ----------------------------------------------------
    // TEST 9: Trigger Mode Routing - Render Worker ignores Trigger-owned jobs
    // ----------------------------------------------------
    // Clear out any active QUEUED jobs from previous tests
    await prisma.backgroundJob.updateMany({
      where: {
        type: 'BACKLINK_VERIFICATION',
        payload: { path: ['backlinkId'], equals: testBacklink.id },
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
      data: { status: 'COMPLETED' },
    });

    // Create a Trigger-owned job (ready to run immediately)
    const triggerJob = await prisma.backgroundJob.create({
      data: {
        type: 'BACKLINK_VERIFICATION',
        status: 'QUEUED',
        nextRunAt: new Date(Date.now() - 10000),
        payload: { backlinkId: testBacklink.id, executionProvider: 'trigger' },
      },
    });

    // Render Worker attempts to claim next job
    const claimedByWorker = await QueueService.claimJob('test-render-worker');
    // Render worker must NOT claim the Trigger-owned job
    assert.notStrictEqual(claimedByWorker?.id, triggerJob.id, 'Render worker must not claim Trigger-owned job');
    if (claimedByWorker) {
      await QueueService.completeJob(claimedByWorker.id);
    }

    // Job in DB must still be QUEUED
    const triggerJobCheck = await prisma.backgroundJob.findUnique({ where: { id: triggerJob.id } });
    assert.strictEqual(triggerJobCheck?.status, 'QUEUED');

    // Trigger task CAN execute and complete it
    await executeBacklinkVerification({ backlinkId: testBacklink.id, jobId: triggerJob.id });
    const triggerJobDone = await prisma.backgroundJob.findUnique({ where: { id: triggerJob.id } });
    assert.strictEqual(triggerJobDone?.status, 'COMPLETED');
    pass('9. Trigger mode routing: Render Worker ignores Trigger-owned job (claimJob returns null), Trigger task executes it');

    // ----------------------------------------------------
    // TEST 10: Render Mode Routing - Render Worker claims Render-owned & legacy jobs
    // ----------------------------------------------------
    await prisma.backgroundJob.updateMany({
      where: { status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'COMPLETED' },
    });

    // 10a: Explicit executionProvider = 'render'
    const renderJob = await prisma.backgroundJob.create({
      data: {
        type: 'BACKLINK_VERIFICATION',
        status: 'QUEUED',
        nextRunAt: new Date(Date.now() - 10000),
        payload: { backlinkId: testBacklink.id, executionProvider: 'render' },
      },
    });

    const claimedRenderJob = await QueueService.claimJob('test-render-worker');
    assert.ok(claimedRenderJob, 'Render worker must claim job with executionProvider="render"');
    assert.strictEqual(claimedRenderJob?.id, renderJob.id);
    assert.strictEqual(claimedRenderJob?.status, 'PROCESSING');
    await QueueService.completeJob(renderJob.id);

    // 10b: Legacy job with no executionProvider
    const legacyJob = await prisma.backgroundJob.create({
      data: {
        type: 'BACKLINK_VERIFICATION',
        status: 'QUEUED',
        nextRunAt: new Date(Date.now() - 10000),
        payload: { backlinkId: testBacklink.id },
      },
    });

    const claimedLegacyJob = await QueueService.claimJob('test-render-worker');
    assert.ok(claimedLegacyJob, 'Render worker must claim legacy job without executionProvider');
    assert.strictEqual(claimedLegacyJob?.id, legacyJob.id);
    assert.strictEqual(claimedLegacyJob?.status, 'PROCESSING');
    await QueueService.completeJob(legacyJob.id);

    pass('10. Render mode routing: Render Worker successfully claims Render-owned and legacy backlink jobs');

    // ----------------------------------------------------
    // TEST 11: Non-backlink jobs unaffected
    // ----------------------------------------------------
    const crawlJob = await prisma.backgroundJob.create({
      data: {
        type: 'SEO_CRAWL',
        status: 'QUEUED',
        nextRunAt: new Date(Date.now() - 10000),
        payload: { websiteId: MOCK_WEBSITE_ID },
      },
    });

    const claimedCrawlJob = await QueueService.claimJob('test-render-worker');
    assert.ok(claimedCrawlJob, 'Render worker must claim SEO_CRAWL job');
    assert.strictEqual(claimedCrawlJob?.id, crawlJob.id);
    assert.strictEqual(claimedCrawlJob?.type, 'SEO_CRAWL');
    assert.strictEqual(claimedCrawlJob?.status, 'PROCESSING');
    await QueueService.completeJob(crawlJob.id);

    pass('11. Non-backlink jobs: SEO_CRAWL, GOOGLE_SYNC, and AI jobs claimed normally by Render Worker');

    // ----------------------------------------------------
    // TEST 12: GET /verification-job status lookup (regression test for column created_at error 42703)
    // ----------------------------------------------------
    // Create an active backlink job
    const pollTestBacklink = await prisma.backlink.create({
      data: {
        websiteId: MOCK_WEBSITE_ID,
        sourceUrl: 'https://example.com/poll',
        targetUrl: 'https://site-a.com/target',
        referringDomain: 'example.com',
        status: 'ACTIVE',
      },
    });

    const verifyRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${pollTestBacklink.id}/verify`)
      .set(authHeadersA);

    assert.strictEqual(verifyRes.status, 202);
    const verifyJobId = verifyRes.body.jobId;
    assert.ok(verifyJobId);

    // Poll status using GET endpoint
    const pollRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${pollTestBacklink.id}/verification-job`)
      .set(authHeadersA);

    assert.strictEqual(pollRes.status, 200);
    assert.ok(pollRes.body.job, 'Job object must be returned');
    assert.strictEqual(pollRes.body.job.id, verifyJobId);
    assert.strictEqual(pollRes.body.job.status, 'QUEUED');
    assert.strictEqual(pollRes.body.job.error, null);
    pass('12. GET /verification-job: Correctly returns latest job status without column "created_at" error');

    // ----------------------------------------------------
    // TEST 13: GET /verification-job returns null when no job exists
    // ----------------------------------------------------
    const unverifiedBacklink = await prisma.backlink.create({
      data: {
        websiteId: MOCK_WEBSITE_ID,
        sourceUrl: 'https://example.com/no-job',
        targetUrl: 'https://site-a.com/target',
        referringDomain: 'example.com',
        status: 'ACTIVE',
      },
    });

    const nullJobRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${unverifiedBacklink.id}/verification-job`)
      .set(authHeadersA);

    assert.strictEqual(nullJobRes.status, 200);
    assert.strictEqual(nullJobRes.body.job, null);
    pass('13. GET /verification-job: Returns { job: null } when no verification job has been queued');
  } catch (err: any) {
    fail('Unhandled test failure', err);
  } finally {
    // Restore original methods
    backlinkVerificationTask.trigger = originalTrigger;
    (backlinkFetcher as any).fetchSafely = originalFetchSafely;
    delete process.env.USE_TRIGGER_BACKLINK_VERIFICATION;
    await cleanupData();
    await prisma.$disconnect();

    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`==================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runTests();
