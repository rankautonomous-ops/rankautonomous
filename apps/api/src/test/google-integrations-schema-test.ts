import '../lib/env';
import { PrismaClient } from '@prisma/client';
import prisma from '../lib/database';

export async function runSchemaTests() {
  console.log('\n==================================================');
  console.log('RUNNING STEP 6I-2 GOOGLE INTEGRATIONS SCHEMA & DATA INTEGRITY TESTS');
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

  const testUserId1 = 'test-user-schema-gsc-1';
  const testUserId2 = 'test-user-schema-gsc-2';
  const testCascadeUserId = 'test-user-schema-cascade';

  const testWebsiteId1 = 'test-website-schema-gsc-1';
  const testWebsiteId2 = 'test-website-schema-gsc-2';
  const testCascadeWebsiteId = 'test-website-schema-cascade';

  const baseDate = new Date('2026-09-16T00:00:00.000Z');
  const nextDate = new Date('2026-09-17T00:00:00.000Z');

  try {
    // ---------------------------------------------------------------------------
    // Setup Isolated Test Users & Websites
    // ---------------------------------------------------------------------------
    await prisma.user.upsert({
      where: { id: testUserId1 },
      update: {},
      create: {
        id: testUserId1,
        email: 'gsc-schema-test1@test.com',
        supabaseAuthId: 'supa-schema-1',
        role: 'CUSTOMER',
      },
    });

    await prisma.user.upsert({
      where: { id: testUserId2 },
      update: {},
      create: {
        id: testUserId2,
        email: 'gsc-schema-test2@test.com',
        supabaseAuthId: 'supa-schema-2',
        role: 'CUSTOMER',
      },
    });

    await prisma.website.upsert({
      where: { id: testWebsiteId1 },
      update: {},
      create: {
        id: testWebsiteId1,
        userId: testUserId1,
        url: 'https://schema-test-site1.com',
        name: 'Schema Test Site 1',
      },
    });

    await prisma.website.upsert({
      where: { id: testWebsiteId2 },
      update: {},
      create: {
        id: testWebsiteId2,
        userId: testUserId2,
        url: 'https://schema-test-site2.com',
        name: 'Schema Test Site 2',
      },
    });

    // ---------------------------------------------------------------------------
    // Test 1: SearchPerformanceRecord can be created
    // ---------------------------------------------------------------------------
    const rec1 = await prisma.searchPerformanceRecord.create({
      data: {
        websiteId: testWebsiteId1,
        date: baseDate,
        query: 'ai seo automation',
        page: 'https://schema-test-site1.com/features',
        device: 'DESKTOP',
        country: 'USA',
        clicks: 14,
        impressions: 320,
        ctr: 0.04375,
        position: 4.8,
      },
    });
    testAssert(
      Boolean(rec1 && rec1.id && rec1.clicks === 14 && rec1.position === 4.8),
      'Test 1: SearchPerformanceRecord can be created with valid performance fields'
    );

    // ---------------------------------------------------------------------------
    // Test 2: Duplicate websiteId + date + query + page + device + country is rejected
    // ---------------------------------------------------------------------------
    let duplicateRejected = false;
    try {
      await prisma.searchPerformanceRecord.create({
        data: {
          websiteId: testWebsiteId1,
          date: baseDate,
          query: 'ai seo automation',
          page: 'https://schema-test-site1.com/features',
          device: 'DESKTOP',
          country: 'USA',
          clicks: 20,
          impressions: 400,
          ctr: 0.05,
          position: 4.2,
        },
      });
    } catch (err: any) {
      duplicateRejected = err.code === 'P2002' || err.message?.includes('Unique constraint');
    }
    testAssert(
      duplicateRejected,
      'Test 2: Duplicate websiteId + date + query + page + device + country is rejected by unique constraint'
    );

    // ---------------------------------------------------------------------------
    // Test 3: Same query/page on different dates is allowed
    // ---------------------------------------------------------------------------
    const recDiffDate = await prisma.searchPerformanceRecord.create({
      data: {
        websiteId: testWebsiteId1,
        date: nextDate,
        query: 'ai seo automation',
        page: 'https://schema-test-site1.com/features',
        device: 'DESKTOP',
        country: 'USA',
        clicks: 18,
        impressions: 350,
        ctr: 0.0514,
        position: 4.1,
      },
    });
    testAssert(
      Boolean(recDiffDate && recDiffDate.id),
      'Test 3: Same query/page on different dates is allowed'
    );

    // ---------------------------------------------------------------------------
    // Test 4: Same query/page/date with different device is allowed
    // ---------------------------------------------------------------------------
    const recDiffDevice = await prisma.searchPerformanceRecord.create({
      data: {
        websiteId: testWebsiteId1,
        date: baseDate,
        query: 'ai seo automation',
        page: 'https://schema-test-site1.com/features',
        device: 'MOBILE',
        country: 'USA',
        clicks: 8,
        impressions: 190,
        ctr: 0.0421,
        position: 5.3,
      },
    });
    testAssert(
      Boolean(recDiffDevice && recDiffDevice.id),
      'Test 4: Same query/page/date with different device is allowed'
    );

    // ---------------------------------------------------------------------------
    // Test 5: Same query/page/date with different country is allowed
    // ---------------------------------------------------------------------------
    const recDiffCountry = await prisma.searchPerformanceRecord.create({
      data: {
        websiteId: testWebsiteId1,
        date: baseDate,
        query: 'ai seo automation',
        page: 'https://schema-test-site1.com/features',
        device: 'DESKTOP',
        country: 'GBR',
        clicks: 5,
        impressions: 95,
        ctr: 0.0526,
        position: 3.9,
      },
    });
    testAssert(
      Boolean(recDiffCountry && recDiffCountry.id),
      'Test 5: Same query/page/date with different country is allowed'
    );

    // ---------------------------------------------------------------------------
    // Test 6: SearchPerformanceRecord cascades when website is deleted
    // ---------------------------------------------------------------------------
    await prisma.user.upsert({
      where: { id: testCascadeUserId },
      update: {},
      create: {
        id: testCascadeUserId,
        email: 'cascade-test@test.com',
        supabaseAuthId: 'supa-cascade-1',
        role: 'CUSTOMER',
      },
    });
    await prisma.website.create({
      data: {
        id: testCascadeWebsiteId,
        userId: testCascadeUserId,
        url: 'https://cascade-test.com',
        name: 'Cascade Test Site',
      },
    });
    await prisma.searchPerformanceRecord.create({
      data: {
        websiteId: testCascadeWebsiteId,
        date: baseDate,
        query: 'cascade check',
        page: 'https://cascade-test.com/check',
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 1.0,
      },
    });
    // Delete website and verify cascade
    await prisma.website.delete({ where: { id: testCascadeWebsiteId } });
    const orphanCount = await prisma.searchPerformanceRecord.count({
      where: { websiteId: testCascadeWebsiteId },
    });
    testAssert(
      orphanCount === 0,
      'Test 6: SearchPerformanceRecord automatically cascades on website deletion'
    );
    await prisma.user.delete({ where: { id: testCascadeUserId } });

    // ---------------------------------------------------------------------------
    // Test 7: AnalyticsSnapshot duplicate websiteId + source + date is rejected
    // ---------------------------------------------------------------------------
    const snap1 = await prisma.analyticsSnapshot.create({
      data: {
        websiteId: testWebsiteId1,
        source: 'GSC',
        date: baseDate,
        metrics: { clicks: 42, impressions: 850, ctr: 0.0494, avgPosition: 6.2 },
      },
    });
    testAssert(Boolean(snap1 && snap1.id), 'Test 7a: Initial AnalyticsSnapshot created successfully');

    let duplicateSnapshotRejected = false;
    try {
      await prisma.analyticsSnapshot.create({
        data: {
          websiteId: testWebsiteId1,
          source: 'GSC',
          date: baseDate,
          metrics: { clicks: 50, impressions: 900, ctr: 0.0555, avgPosition: 5.8 },
        },
      });
    } catch (err: any) {
      duplicateSnapshotRejected = err.code === 'P2002' || err.message?.includes('Unique constraint');
    }
    testAssert(
      duplicateSnapshotRejected,
      'Test 7b: AnalyticsSnapshot duplicate websiteId + source + date is rejected'
    );

    // ---------------------------------------------------------------------------
    // Test 8: Different source on same date is allowed for AnalyticsSnapshot
    // ---------------------------------------------------------------------------
    const snapDiffSource = await prisma.analyticsSnapshot.create({
      data: {
        websiteId: testWebsiteId1,
        source: 'GA4',
        date: baseDate,
        metrics: { sessions: 120, users: 95, pageViews: 280, engagementRate: 0.65 },
      },
    });
    testAssert(
      Boolean(snapDiffSource && snapDiffSource.id),
      'Test 8: Different source (GA4 vs GSC) on same date is allowed for AnalyticsSnapshot'
    );

    // ---------------------------------------------------------------------------
    // Test 9: Keyword GSC fields accept nullable values
    // ---------------------------------------------------------------------------
    const kwNullable = await prisma.keyword.create({
      data: {
        websiteId: testWebsiteId1,
        keyword: 'nullable gsc test keyword',
        normalizedKeyword: 'nullable gsc test keyword',
        currentRanking: null,
        gscClicks30d: null,
        gscImpressions30d: null,
        gscAvgPosition: null,
        gscLastUpdated: null,
      },
    });
    testAssert(
      kwNullable.gscClicks30d === null &&
        kwNullable.gscImpressions30d === null &&
        kwNullable.gscAvgPosition === null &&
        kwNullable.gscLastUpdated === null,
      'Test 9: Keyword GSC fields cleanly accept null values when unpopulated'
    );

    // ---------------------------------------------------------------------------
    // Test 10: Keyword.currentRanking remains independent from GSC fields
    // ---------------------------------------------------------------------------
    const now = new Date();
    const kwEnriched = await prisma.keyword.update({
      where: { id: kwNullable.id },
      data: {
        currentRanking: 3, // SERP absolute rank
        gscClicks30d: 45,
        gscImpressions30d: 1200,
        gscAvgPosition: 5.7, // GSC weighted average position
        gscLastUpdated: now,
      },
    });
    testAssert(
      kwEnriched.currentRanking === 3 &&
        kwEnriched.gscAvgPosition === 5.7 &&
        kwEnriched.gscClicks30d === 45 &&
        kwEnriched.gscImpressions30d === 1200,
      'Test 10: Keyword.currentRanking remains strictly independent from GSC average position'
    );

    // ---------------------------------------------------------------------------
    // Test 11: Integration sync fields persist correctly
    // ---------------------------------------------------------------------------
    const syncTime = new Date();
    const integration = await prisma.integration.create({
      data: {
        websiteId: testWebsiteId1,
        provider: 'GSC',
        status: 'ACTIVE',
        lastSyncAt: syncTime,
        lastSyncStatus: 'SUCCESS',
        lastSyncError: null,
        config: { siteUrl: 'sc-domain:schema-test-site1.com' },
      },
    });
    testAssert(
      integration.lastSyncStatus === 'SUCCESS' &&
        integration.lastSyncError === null &&
        Boolean(integration.lastSyncAt),
      'Test 11a: Integration sync status SUCCESS and timestamp persist correctly'
    );

    const integrationError = await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncStatus: 'ERROR',
        lastSyncError: 'Search Console API rate limit exceeded (Quota 429)',
      },
    });
    testAssert(
      integrationError.lastSyncStatus === 'ERROR' &&
        integrationError.lastSyncError === 'Search Console API rate limit exceeded (Quota 429)',
      'Test 11b: Integration sync error state and description persist correctly'
    );

    // ---------------------------------------------------------------------------
    // Test 12: Tenant isolation across websites
    // ---------------------------------------------------------------------------
    // Add record for website 2
    await prisma.searchPerformanceRecord.create({
      data: {
        websiteId: testWebsiteId2,
        date: baseDate,
        query: 'tenant 2 query',
        page: 'https://schema-test-site2.com/privacy',
        clicks: 3,
        impressions: 50,
        ctr: 0.06,
        position: 2.1,
      },
    });

    const site1Records = await prisma.searchPerformanceRecord.findMany({
      where: { websiteId: testWebsiteId1 },
    });
    const site2Records = await prisma.searchPerformanceRecord.findMany({
      where: { websiteId: testWebsiteId2 },
    });

    const hasCrossPollution =
      site1Records.some((r) => r.websiteId !== testWebsiteId1) ||
      site2Records.some((r) => r.websiteId !== testWebsiteId2);

    testAssert(
      !hasCrossPollution && site1Records.length === 4 && site2Records.length === 1,
      'Test 12: Tenant isolation verified: queries scoped by websiteId never cross-pollute'
    );

    console.log('\n==================================================');
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`FATAL ERROR IN SCHEMA TESTS: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // ---------------------------------------------------------------------------
    // Strictly Scoped Teardown
    // ---------------------------------------------------------------------------
    await prisma.searchPerformanceRecord.deleteMany({
      where: { websiteId: { in: [testWebsiteId1, testWebsiteId2] } },
    });
    await prisma.analyticsSnapshot.deleteMany({
      where: { websiteId: { in: [testWebsiteId1, testWebsiteId2] } },
    });
    await prisma.keyword.deleteMany({
      where: { websiteId: { in: [testWebsiteId1, testWebsiteId2] } },
    });
    await prisma.integration.deleteMany({
      where: { websiteId: { in: [testWebsiteId1, testWebsiteId2] } },
    });
    await prisma.website.deleteMany({
      where: { id: { in: [testWebsiteId1, testWebsiteId2] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2] } },
    });

    // Final safety check: development user exists
    const devUser = await prisma.user.findFirst({
      where: { email: 'madhanraj5002@gmail.com' },
    });
    if (!devUser) {
      console.error('CRITICAL WARNING: Development user missing after test teardown!');
    }
  }
}

if (require.main === module) {
  runSchemaTests()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
