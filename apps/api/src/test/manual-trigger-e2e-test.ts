process.env.NODE_ENV = 'test';
import '../lib/env';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/database';
import supabase from '../lib/supabase';
import { QueueService } from '../services/queue';
import assert from 'node:assert';

const REAL_WEBSITE_ID = 'dc585a6b-38a6-4ce0-a1d5-898f651a265f';
const REAL_BACKLINK_ID = '443f8571-465c-4769-89f8-65be7d818207';
const REAL_USER_ID = '7b39eff4-1497-4c3e-b5db-3a7a67e97ef6';
const REAL_SUPABASE_AUTH_ID = 'bab6a8e6-1ceb-46f3-a8be-eea4ab5854da';

async function runE2ETest() {
  console.log('==================================================');
  console.log('RUNNING LOCAL TRIGGER.DEV E2E INTEGRATION TEST');
  console.log('==================================================\n');

  // Step 1: Set feature flag to true for this local test run
  process.env.USE_TRIGGER_BACKLINK_VERIFICATION = 'true';
  console.log('1. Feature Flag: USE_TRIGGER_BACKLINK_VERIFICATION =', process.env.USE_TRIGGER_BACKLINK_VERIFICATION);

  // Step 2: Configure Supabase mock to authenticate as the real owner
  supabase.auth.getUser = async (token: string) => {
    if (token === 'VALID_DEV_TOKEN') {
      return {
        data: {
          user: {
            id: REAL_SUPABASE_AUTH_ID,
            email: 'madhanraj5002@gmail.com',
            user_metadata: { name: 'Madhan Raj' },
          },
        },
        error: null,
      } as any;
    }
    return { data: { user: null }, error: new Error('Invalid token') } as any;
  };

  // Step 3: Check initial Backlink state & reset status to UNVERIFIED for fresh verification
  const initialBacklink = await prisma.backlink.findUnique({
    where: { id: REAL_BACKLINK_ID },
    include: { website: true },
  });
  assert.ok(initialBacklink, 'Controlled backlink must exist in database');
  assert.strictEqual(initialBacklink.websiteId, REAL_WEBSITE_ID);
  console.log('2. Initial Backlink state:', {
    id: initialBacklink.id,
    sourceUrl: initialBacklink.sourceUrl,
    targetUrl: initialBacklink.targetUrl,
    verificationStatus: initialBacklink.verificationStatus,
  });

  // Set backlink verificationStatus to UNVERIFIED so we can observe the transition
  await prisma.backlink.update({
    where: { id: REAL_BACKLINK_ID },
    data: { verificationStatus: 'UNVERIFIED', lastErrorMessage: null },
  });

  // Ensure no conflicting active jobs exist for this backlink before starting
  await prisma.backgroundJob.deleteMany({
    where: {
      type: 'BACKLINK_VERIFICATION',
      payload: { path: ['backlinkId'], equals: REAL_BACKLINK_ID },
    },
  });

  const countBefore = await prisma.backlink.count({ where: { websiteId: REAL_WEBSITE_ID } });

  // Step 4: Dispatch verification through the REAL application API endpoint
  console.log('\n3. Sending POST request to REAL application API:');
  console.log(`   POST /api/websites/${REAL_WEBSITE_ID}/backlinks/${REAL_BACKLINK_ID}/verify`);

  const apiResponse = await request(app)
    .post(`/api/websites/${REAL_WEBSITE_ID}/backlinks/${REAL_BACKLINK_ID}/verify`)
    .set('Authorization', 'Bearer VALID_DEV_TOKEN');

  console.log('   API Response Status:', apiResponse.status);
  console.log('   API Response Body:', JSON.stringify(apiResponse.body, null, 2));

  assert.strictEqual(apiResponse.status, 202, 'API must return HTTP 202');
  assert.strictEqual(apiResponse.body.success, true);
  assert.strictEqual(apiResponse.body.backlinkId, REAL_BACKLINK_ID);
  const createdJobId = apiResponse.body.jobId;
  assert.ok(createdJobId, 'API must return a jobId');

  // Step 5: Verify BackgroundJob created in database with executionProvider = 'trigger'
  const jobRecord = await prisma.backgroundJob.findUnique({ where: { id: createdJobId } });
  assert.ok(jobRecord, 'BackgroundJob must be created in database');
  console.log('\n4. BackgroundJob created:', {
    id: jobRecord.id,
    type: jobRecord.type,
    status: jobRecord.status,
    payload: jobRecord.payload,
  });

  assert.strictEqual(jobRecord.type, 'BACKLINK_VERIFICATION');
  assert.strictEqual((jobRecord.payload as any).backlinkId, REAL_BACKLINK_ID);
  assert.strictEqual((jobRecord.payload as any).executionProvider, 'trigger', 'Payload must identify executionProvider="trigger"');

  // Step 6: Verify Render Worker CANNOT claim this Trigger-owned job
  // We test claimJob() with a test worker ID
  const claimedByRenderWorker = await QueueService.claimJob('test-render-worker');
  if (claimedByRenderWorker) {
    assert.notStrictEqual(claimedByRenderWorker.id, createdJobId, 'Render Worker MUST NOT claim the Trigger-owned job');
    // If it claimed some unrelated job, complete it
    await QueueService.completeJob(claimedByRenderWorker.id);
  }
  console.log('5. Render Worker isolation: Verified claimJob() excludes Trigger-owned job. Result: EXCLUDED');

  // Step 7: Wait for Trigger.dev local runner to process the task
  console.log('\n6. Waiting for Trigger.dev to process the task and update BackgroundJob...');
  let completedJob: any = null;
  const startTime = Date.now();
  const timeoutMs = 60000; // 60s timeout

  while (Date.now() - startTime < timeoutMs) {
    const pollJob = await prisma.backgroundJob.findUnique({ where: { id: createdJobId } });
    if (pollJob && (pollJob.status === 'COMPLETED' || pollJob.status === 'FAILED')) {
      completedJob = pollJob;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
    process.stdout.write('.');
  }
  console.log('');

  assert.ok(completedJob, `Trigger task must complete within ${timeoutMs / 1000}s`);
  console.log('7. Trigger.dev execution completed!');
  console.log('   Final BackgroundJob Status:', completedJob.status);
  console.log('   Attempts:', completedJob.attempts);
  console.log('   LockedBy:', completedJob.lockedBy);
  console.log('   Error:', completedJob.error);

  assert.strictEqual(completedJob.status, 'COMPLETED', 'BackgroundJob must be COMPLETED');

  // Step 8: Read-only verification of the updated Backlink
  const finalBacklink = await prisma.backlink.findUnique({ where: { id: REAL_BACKLINK_ID } });
  assert.ok(finalBacklink, 'Backlink must exist');
  console.log('\n8. Final Backlink state in database:', {
    id: finalBacklink.id,
    sourceUrl: finalBacklink.sourceUrl,
    targetUrl: finalBacklink.targetUrl,
    verificationStatus: finalBacklink.verificationStatus,
    lastChecked: finalBacklink.lastChecked,
    linkAttributes: finalBacklink.linkAttributes,
    lastErrorMessage: finalBacklink.lastErrorMessage,
  });

  assert.strictEqual(finalBacklink.verificationStatus, 'MISSING', 'Verification status for example.com must be MISSING');
  assert.ok(finalBacklink.lastChecked, 'lastChecked must be updated');

  // Step 9: Verify no duplicate Backlink records created
  const countAfter = await prisma.backlink.count({ where: { websiteId: REAL_WEBSITE_ID } });
  assert.strictEqual(countAfter, countBefore, 'Backlink count must not increase (no duplicate created)');
  console.log('9. Duplicate Backlink check: Backlink count unchanged at', countAfter);

  // Step 10: Verify no duplicate BackgroundJob created
  const allMatchingJobs = await prisma.$queryRaw<any[]>`
    SELECT id, status, "createdAt" FROM "BackgroundJob"
    WHERE type = 'BACKLINK_VERIFICATION'
      AND payload->>'backlinkId' = ${REAL_BACKLINK_ID}
  `;
  assert.strictEqual(allMatchingJobs.length, 1, 'Exactly 1 BackgroundJob must exist for this verification');
  console.log('10. Duplicate BackgroundJob check: Exactly 1 job found:', allMatchingJobs[0].id);

  // Step 11: Verify Tenant Isolation: User B cannot trigger verification on this backlink
  supabase.auth.getUser = async () => ({
    data: { user: { id: 'other-user-auth-id', email: 'other@example.com' } },
    error: null,
  } as any);

  const unauthorizedRes = await request(app)
    .post(`/api/websites/${REAL_WEBSITE_ID}/backlinks/${REAL_BACKLINK_ID}/verify`)
    .set('Authorization', 'Bearer OTHER_USER_TOKEN');

  assert.ok([403, 404].includes(unauthorizedRes.status), `Cross-tenant verification attempt must be rejected with 403 or 404, received ${unauthorizedRes.status}`);
  console.log(`11. Tenant isolation check: Unauthorized cross-tenant attempt returned ${unauthorizedRes.status} (Access Blocked)`);

  // Step 12: Restore feature flag to false
  delete process.env.USE_TRIGGER_BACKLINK_VERIFICATION;
  console.log('\n12. Feature Flag restored: USE_TRIGGER_BACKLINK_VERIFICATION is unset/false');

  console.log('\n==================================================');
  console.log('ALL E2E INTEGRATION CHECKS PASSED SUCCESSFULLY!');
  console.log('==================================================\n');
}

runE2ETest()
  .catch((err) => {
    console.error('\nE2E TEST FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    delete process.env.USE_TRIGGER_BACKLINK_VERIFICATION;
    await prisma.$disconnect();
  });
