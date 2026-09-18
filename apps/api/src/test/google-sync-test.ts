import assert from 'assert';
import prisma from '../lib/database';
import { encryptJson } from '../lib/encryption';
import {
  GOOGLE_PROVIDERS,
  setGoogleHttpMock,
  syncGoogleIntegrations,
} from '../services/google';

export async function runGoogleSyncTests() {
  console.log('\n==================================================');
  console.log('RUNNING GOOGLE SYNC PIPELINE TESTS');
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

  const testUserId = 'test-user-sync-1';
  const testWebsiteId = 'test-website-sync-1';

  try {
    // ---------------------------------------------------------------------------
    // Setup Isolated Test Data
    // ---------------------------------------------------------------------------
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'sync-test@test.com',
        supabaseAuthId: 'supa-sync-1',
        role: 'CUSTOMER',
      },
    });

    await prisma.website.upsert({
      where: { id: testWebsiteId },
      update: {},
      create: {
        id: testWebsiteId,
        userId: testUserId,
        url: 'https://sync-test.com',
        name: 'Sync Test Site',
      },
    });

    const encryptedCredentials = encryptJson({
      accessToken: 'test-valid-access-token',
      expiresAt: Date.now() + 3600 * 1000,
    });

    // Create GSC Integration
    const gscConfig = { selectedProperty: 'https://sync-test.com' };
    await prisma.integration.upsert({
      where: { websiteId_provider: { websiteId: testWebsiteId, provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE } },
      update: { status: 'ACTIVE', credentials: encryptedCredentials, config: gscConfig },
      create: {
        websiteId: testWebsiteId,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
        status: 'ACTIVE',
        credentials: encryptedCredentials,
        config: gscConfig,
      },
    });

    // Create GA4 Integration
    const ga4Config = { selectedProperty: 'properties/123456' };
    await prisma.integration.upsert({
      where: { websiteId_provider: { websiteId: testWebsiteId, provider: GOOGLE_PROVIDERS.ANALYTICS } },
      update: { status: 'ACTIVE', credentials: encryptedCredentials, config: ga4Config },
      create: {
        websiteId: testWebsiteId,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
        status: 'ACTIVE',
        credentials: encryptedCredentials,
        config: ga4Config,
      },
    });

    // ---------------------------------------------------------------------------
    // Mock HTTP Requests
    // ---------------------------------------------------------------------------
    setGoogleHttpMock(async (url, options) => {
      if (url.includes('searchAnalytics/query')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            rows: [
              {
                keys: ['2023-09-01', 'test query', 'https://sync-test.com/page1', 'DESKTOP', 'usa'],
                clicks: 10,
                impressions: 100,
                ctr: 0.1,
                position: 5.5,
              },
            ],
          }),
          text: async () => '',
        };
      }
      if (url.includes('analyticsdata.googleapis.com')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            rows: [
              {
                dimensionValues: [{ value: '20230901' }],
                metricValues: [
                  { value: '50' }, // activeUsers
                  { value: '60' }, // sessions
                  { value: '120' }, // screenPageViews
                  { value: '0.75' }, // engagementRate
                ],
              },
            ],
          }),
          text: async () => '',
        };
      }

      return {
        status: 404,
        ok: false,
        json: async () => ({ error: 'Not found' }),
        text: async () => 'Not found',
      };
    });

    // ---------------------------------------------------------------------------
    // Run Sync Orchestrator
    // ---------------------------------------------------------------------------
    const result = await syncGoogleIntegrations(testWebsiteId, testUserId);

    testAssert(result.success === true, 'Test 1: Orchestrator ran successfully');
    testAssert(result.searchConsole.success === true, 'Test 2: GSC sync returned success');
    testAssert((result.searchConsole as any).recordsProcessed === 1, 'Test 3: GSC processed exactly 1 row');
    testAssert(result.analytics.success === true, 'Test 4: GA4 sync returned success');
    testAssert((result.analytics as any).snapshotsProcessed === 1, 'Test 5: GA4 processed exactly 1 snapshot');

    // ---------------------------------------------------------------------------
    // Verify Database Persistence
    // ---------------------------------------------------------------------------
    const gscRecords = await prisma.searchPerformanceRecord.findMany({
      where: { websiteId: testWebsiteId },
    });
    testAssert(gscRecords.length === 1 && gscRecords[0].clicks === 10, 'Test 6: GSC data correctly persisted to SearchPerformanceRecord');

    const ga4Records = await prisma.analyticsSnapshot.findMany({
      where: { websiteId: testWebsiteId, source: GOOGLE_PROVIDERS.ANALYTICS },
    });
    testAssert(
      ga4Records.length === 1 && (ga4Records[0].metrics as any).activeUsers === 50,
      'Test 7: GA4 data correctly persisted to AnalyticsSnapshot'
    );

    // ---------------------------------------------------------------------------
    // Test Idempotency (Running again)
    // ---------------------------------------------------------------------------
    const result2 = await syncGoogleIntegrations(testWebsiteId, testUserId);
    testAssert(result2.success === true, 'Test 8: Idempotency - second run succeeds');

    const gscRecordsAfter = await prisma.searchPerformanceRecord.findMany({
      where: { websiteId: testWebsiteId },
    });
    testAssert(gscRecordsAfter.length === 1, 'Test 9: No duplicate GSC records created');

    const ga4RecordsAfter = await prisma.analyticsSnapshot.findMany({
      where: { websiteId: testWebsiteId, source: GOOGLE_PROVIDERS.ANALYTICS },
    });
    testAssert(ga4RecordsAfter.length === 1, 'Test 10: No duplicate GA4 records created');

    // ---------------------------------------------------------------------------
    // Test Tenant Isolation
    // ---------------------------------------------------------------------------
    const isolationResult = await syncGoogleIntegrations(testWebsiteId, 'wrong-user-id');
    testAssert(
      isolationResult.searchConsole.status === 'ERROR' &&
        isolationResult.searchConsole.error?.includes('Unauthorized'),
      'Test 11: Tenant isolation prevents syncing another user\'s website (GSC)'
    );

    console.log('\n==================================================');
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================\n');

    if (failed > 0) process.exit(1);
  } catch (error: any) {
    console.error(`FATAL ERROR IN GOOGLE SYNC TESTS: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    setGoogleHttpMock(null);

    await prisma.searchPerformanceRecord.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.analyticsSnapshot.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.integration.deleteMany({ where: { websiteId: testWebsiteId } });
    await prisma.website.deleteMany({ where: { id: testWebsiteId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  }
}

if (require.main === module) {
  runGoogleSyncTests()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
