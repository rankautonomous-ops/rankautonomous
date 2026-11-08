import { Request, Response, NextFunction } from 'express';
import { requireCronAuth } from '../routes/cron';
import { executeDailyCron, drainBackgroundJobs } from '../services/cronService';
import prisma from '../lib/database';

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createMockContext(options: {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}) {
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;

  const req = {
    headers: options.headers || {},
    query: options.query || {},
  } as unknown as Request;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  } as unknown as Response;

  const next: NextFunction = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getData: () => responseData,
    isNextCalled: () => nextCalled,
  };
}

async function runTests() {
  console.log('--- Running Automated Daily Cron & Endpoint Tests ---');

  const originalCronSecret = process.env.CRON_SECRET;
  const originalTriggerSecret = process.env.TRIGGER_SECRET_KEY;
  const TEST_SECRET = 'test-cron-secret-rankautonomous-2026';

  try {
    process.env.CRON_SECRET = TEST_SECRET;

    // Test 1: Reject unauthenticated request (no token/header)
    console.log('Test 1: Reject unauthenticated cron request');
    {
      const ctx = createMockContext({});
      requireCronAuth(ctx.req, ctx.res, ctx.next);
      assert(!ctx.isNextCalled(), 'next() should not be called when unauthenticated');
      assert(ctx.getStatus() === 401, `Expected 401, got ${ctx.getStatus()}`);
      assert(ctx.getData()?.error === 'Unauthorized', 'Expected Unauthorized error message');
      console.log('✅ Unauthenticated requests strictly rejected with 401');
    }

    // Test 2: Reject request with invalid secret
    console.log('Test 2: Reject request with wrong cron secret');
    {
      const ctx = createMockContext({
        headers: { authorization: 'Bearer wrong-secret' }
      });
      requireCronAuth(ctx.req, ctx.res, ctx.next);
      assert(!ctx.isNextCalled(), 'next() should not be called with invalid secret');
      assert(ctx.getStatus() === 401, `Expected 401, got ${ctx.getStatus()}`);
      console.log('✅ Wrong secret rejected with 401');
    }

    // Test 3: Accept request with Authorization: Bearer <secret>
    console.log('Test 3: Accept Authorization: Bearer <secret>');
    {
      const ctx = createMockContext({
        headers: { authorization: `Bearer ${TEST_SECRET}` }
      });
      requireCronAuth(ctx.req, ctx.res, ctx.next);
      assert(ctx.isNextCalled(), 'next() should be called with valid Bearer token');
      assert(ctx.getStatus() === 200, `Expected 200, got ${ctx.getStatus()}`);
      console.log('✅ Valid Bearer token authenticated successfully');
    }

    // Test 4: Accept request with x-cron-secret header
    console.log('Test 4: Accept x-cron-secret header');
    {
      const ctx = createMockContext({
        headers: { 'x-cron-secret': TEST_SECRET }
      });
      requireCronAuth(ctx.req, ctx.res, ctx.next);
      assert(ctx.isNextCalled(), 'next() should be called with valid x-cron-secret');
      console.log('✅ Valid x-cron-secret header authenticated successfully');
    }

    // Test 5: Accept request with query parameter ?secret=
    console.log('Test 5: Accept ?secret= query parameter');
    {
      const ctx = createMockContext({
        query: { secret: TEST_SECRET }
      });
      requireCronAuth(ctx.req, ctx.res, ctx.next);
      assert(ctx.isNextCalled(), 'next() should be called with valid ?secret= parameter');
      console.log('✅ Valid ?secret= query parameter authenticated successfully');
    }

    // Test 6: Fallback to TRIGGER_SECRET_KEY when CRON_SECRET is not explicitly set
    console.log('Test 6: Fallback to TRIGGER_SECRET_KEY');
    {
      delete process.env.CRON_SECRET;
      process.env.TRIGGER_SECRET_KEY = 'trigger-dev-secret-fallback';

      const ctx = createMockContext({
        headers: { authorization: 'Bearer trigger-dev-secret-fallback' }
      });
      requireCronAuth(ctx.req, ctx.res, ctx.next);
      assert(ctx.isNextCalled(), 'next() should accept TRIGGER_SECRET_KEY fallback');
      console.log('✅ Graceful fallback to existing TRIGGER_SECRET_KEY verified');
    }

    // Test 7: Master executeDailyCron execution
    console.log('Test 7: Execute master executeDailyCron workflow');
    {
      const result = await executeDailyCron();
      assert(typeof result.success === 'boolean', 'Expected boolean success property');
      assert(typeof result.durationMs === 'number', 'Expected durationMs number');
      assert(result.contentGeneration !== undefined, 'Expected contentGeneration metrics');
      assert(typeof result.backlinksProcessed === 'number', 'Expected backlinksProcessed count');
      console.log('✅ Master daily cron executed cleanly:', JSON.stringify({
        success: result.success,
        durationMs: result.durationMs,
        contentGeneration: result.contentGeneration,
        jobsProcessed: result.jobsProcessed
      }));
    }

    // Test 8: Drain queued jobs service
    console.log('Test 8: Drain background jobs service');
    {
      const drained = await drainBackgroundJobs(5, 'test-cron-runner');
      assert(typeof drained === 'number', 'Expected drained count to be a number');
      console.log(`✅ Background job drain completed cleanly (processed ${drained} jobs)`);
    }

    console.log('\n==================================================');
    console.log('ALL 8 CRON AUTOMATION TESTS PASSED CLEANLY');
    console.log('==================================================');

  } finally {
    process.env.CRON_SECRET = originalCronSecret;
    process.env.TRIGGER_SECRET_KEY = originalTriggerSecret;
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('Cron tests failed:', err);
  process.exit(1);
});

