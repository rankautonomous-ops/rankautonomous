import assert from 'assert';
import prisma from '../lib/database';
import { encryptJson } from '../lib/encryption';
import { getPerformanceDataController } from '../routes/website';
import { GOOGLE_PROVIDERS } from '../services/google';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../types/auth';

function createMockContext(user?: AuthenticatedUser, params: any = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req = {
    user,
    params,
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

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

export async function runPerformanceApiTests() {
  console.log('\n==================================================');
  console.log('RUNNING PERFORMANCE API TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`PASS: ${msg}`);
      passed++;
    } else {
      console.error(`FAIL: ${msg}`);
      failed++;
    }
  }

  const testUserId = 'test-perf-user';
  const testWebsiteId = 'test-perf-website';
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const testUser: AuthenticatedUser = {
    id: testUserId,
    supabaseAuthId: 'supa-perf-1',
    email: 'perf-test@test.com',
    name: 'Perf Test',
    role: 'CUSTOMER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    // Clean up first in case of previous test crashes
    await prisma.searchPerformanceRecord.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.analyticsSnapshot.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.integration.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.website.deleteMany({ where: { id: testWebsiteId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });

    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'perf-test@test.com',
        supabaseAuthId: 'supa-perf-1',
        role: 'CUSTOMER',
      },
    });

    await prisma.website.upsert({
      where: { id: testWebsiteId },
      update: {},
      create: {
        id: testWebsiteId,
        userId: testUserId,
        url: 'https://perf-test.com',
        name: 'Perf Test Site',
      },
    });

    // Case 1: Empty Dataset (No Integrations)
    const ctx1 = createMockContext(testUser, { id: testWebsiteId });
    await getPerformanceDataController(ctx1.req, ctx1.res);
    testAssert(ctx1.getStatus() === 200, 'Test 1: Empty dataset returns 200');
    testAssert(ctx1.getData()?.searchConsole === null, 'Test 2: No GSC integration returns null');
    testAssert(ctx1.getData()?.analytics === null, 'Test 3: No GA4 integration returns null');

    // Add Integrations
    const encryptedCredentials = encryptJson({ accessToken: 'fake' });
    await prisma.integration.create({
      data: {
        websiteId: testWebsiteId,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
        status: 'ACTIVE',
        credentials: encryptedCredentials,
        config: {},
      }
    });
    await prisma.integration.create({
      data: {
        websiteId: testWebsiteId,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
        status: 'ACTIVE',
        credentials: encryptedCredentials,
        config: {},
      }
    });

    // Case 2: Integrations exist but no data
    const ctx2 = createMockContext(testUser, { id: testWebsiteId });
    await getPerformanceDataController(ctx2.req, ctx2.res);
    testAssert(ctx2.getStatus() === 200, 'Test 4: Integrations exist returns 200');
    testAssert(ctx2.getData().searchConsole !== null, 'Test 5: GSC object exists');
    testAssert(ctx2.getData().searchConsole.clicks === 0, 'Test 6: GSC clicks are 0');
    testAssert(ctx2.getData().analytics !== null, 'Test 7: GA4 object exists');
    testAssert(ctx2.getData().analytics.organicSessions === 0, 'Test 8: GA4 sessions are 0');

    // Case 3: Populated dataset
    await prisma.searchPerformanceRecord.create({
      data: {
        websiteId: testWebsiteId,
        date: new Date(),
        query: 'test query',
        page: 'https://perf-test.com/page1',
        device: 'DESKTOP',
        country: 'usa',
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        position: 5.5
      }
    });
    await prisma.analyticsSnapshot.create({
      data: {
        websiteId: testWebsiteId,
        source: GOOGLE_PROVIDERS.ANALYTICS,
        date: new Date(),
        metrics: {
          activeUsers: 50,
          sessions: 60,
          screenPageViews: 120,
          engagementRate: 0.75
        }
      }
    });

    const ctx3 = createMockContext(testUser, { id: testWebsiteId });
    await getPerformanceDataController(ctx3.req, ctx3.res);
    testAssert(ctx3.getStatus() === 200, 'Test 9: Populated dataset returns 200');
    testAssert(ctx3.getData().searchConsole.clicks === 10, 'Test 10: GSC clicks correctly aggregated');
    testAssert(ctx3.getData().searchConsole.topQueries.length === 1, 'Test 11: Top queries grouped');
    testAssert(ctx3.getData().analytics.activeUsers === 50, 'Test 12: GA4 activeUsers correctly aggregated');
    testAssert(ctx3.getData().analytics.engagementRate === 0.75, 'Test 13: GA4 engagement rate correctly mapped');

    // Case 4: Tenant Isolation
    const otherUser: AuthenticatedUser = {
      id: 'other-perf-user',
      supabaseAuthId: 'other-supa',
      email: 'other@test.com',
      name: 'Other',
      role: 'CUSTOMER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await prisma.user.upsert({
      where: { id: otherUser.id },
      update: {},
      create: { id: otherUser.id, email: otherUser.email, supabaseAuthId: otherUser.supabaseAuthId, role: otherUser.role }
    });
    
    // otherUser tries to access testWebsiteId
    const ctx4 = createMockContext(otherUser, { id: testWebsiteId });
    await getPerformanceDataController(ctx4.req, ctx4.res);
    testAssert(ctx4.getStatus() === 403 || ctx4.getStatus() === 404, 'Test 14: Tenant isolation prevents reading another user\'s website');

    console.log('\n==================================================');
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================\n');

    if (failed > 0) process.exit(1);
  } catch (error: any) {
    console.error(`FATAL ERROR IN PERFORMANCE API TESTS: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.searchPerformanceRecord.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.analyticsSnapshot.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.integration.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.website.deleteMany({ where: { id: testWebsiteId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.user.deleteMany({ where: { id: 'other-perf-user' } });
  }
}

if (require.main === module) {
  runPerformanceApiTests()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
