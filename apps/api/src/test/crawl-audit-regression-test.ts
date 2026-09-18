import { Request, Response, NextFunction } from 'express';
import websiteRouter from '../routes/website';
import { AuthenticatedUser } from '../types/auth';
import prisma from '../lib/database';
import { startCrawl } from '../services/crawler';
import { startSeoAudit } from '../services/seoAudit';
import dns from 'dns';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../../.env') });

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function createMockContext(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
  user?: AuthenticatedUser;
  params?: any;
  query?: any;
} = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    body: options.body || {},
    user: options.user,
    params: options.params || {},
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
    send(data: any) {
      responseData = data;
      return this;
    },
  } as unknown as Response;

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function dispatchWebsiteRoute(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  user?: AuthenticatedUser,
  body?: any
) {
  const ctx = createMockContext({ method, url, user, body });
  await new Promise<void>((resolve) => {
    const origJson = ctx.res.json;
    ctx.res.json = function (data: any) { origJson.call(this, data); resolve(); return this; };
    const origSend = ctx.res.send;
    ctx.res.send = function (data: any) { origSend.call(this, data); resolve(); return this; };
    (websiteRouter as any)(ctx.req, ctx.res, () => { resolve(); });
  });
  return ctx;
}

// Mock DNS and Fetch for controlled testing
const originalLookup = dns.lookup;
let mockDnsMap: Record<string, string> = {};

(dns as any).lookup = function(hostname: string, options: any, callback: any) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  if (mockDnsMap[hostname]) {
    return callback(null, mockDnsMap[hostname], 4);
  }
  return originalLookup(hostname, options, callback);
};

const originalFetch = global.fetch;
let mockFetchMap: Record<string, { status: number; body: string; headers?: Record<string, string> }> = {};

global.fetch = async function(url: any, init: any) {
  const urlStr = url.toString();
  if (mockFetchMap[urlStr]) {
    const mockRes = mockFetchMap[urlStr];
    return new Response(mockRes.body, {
      status: mockRes.status,
      headers: {
        'content-type': 'text/html',
        ...(mockRes.headers || {})
      }
    });
  }
  return originalFetch(url, init);
} as any;

async function runRegressionTests() {
  console.log('==================================================');
  console.log('RUNNING CRAWL & AUDIT REGRESSION TESTS (10 REQUIREMENTS)');
  console.log('==================================================');

  // Setup test users with active subscriptions
  const userA = await prisma.user.create({
    data: { email: `reg_user_a_${Date.now()}@test.com`, supabaseAuthId: `auth_a_${Date.now()}` }
  });
  const userB = await prisma.user.create({
    data: { email: `reg_user_b_${Date.now()}@test.com`, supabaseAuthId: `auth_b_${Date.now()}` }
  });

  await prisma.subscription.create({
    data: {
      userId: userA.id,
      stripeCustomerId: `cus_a_${Date.now()}`,
      stripeSubscriptionId: `sub_a_${Date.now()}`,
      status: 'active',
      plan: 'monthly',
      interval: 'month',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000)
    }
  });

  await prisma.subscription.create({
    data: {
      userId: userB.id,
      stripeCustomerId: `cus_b_${Date.now()}`,
      stripeSubscriptionId: `sub_b_${Date.now()}`,
      status: 'active',
      plan: 'monthly',
      interval: 'month',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000)
    }
  });

  const authUserA: AuthenticatedUser = {
    id: userA.id,
    supabaseAuthId: userA.supabaseAuthId || `auth_a_${Date.now()}`,
    email: userA.email,
    name: null,
    role: 'CUSTOMER',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const authUserB: AuthenticatedUser = {
    id: userB.id,
    supabaseAuthId: userB.supabaseAuthId || `auth_b_${Date.now()}`,
    email: userB.email,
    name: null,
    role: 'CUSTOMER',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Create website for user A
  const siteA = await prisma.website.create({
    data: {
      userId: userA.id,
      url: 'https://regression.rankautonomous.com',
      name: 'Regression Site',
      platform: 'WordPress',
      status: 'CONNECTED',
    }
  });

  // Mock DNS and mock fetch for regression domain
  mockDnsMap['regression.rankautonomous.com'] = '93.184.216.34';
  const homeHtml = '<html><head><title>Regression Home</title></head><body><h1>Hello</h1><p>Test content for evaluation</p></body></html>';
  mockFetchMap['https://regression.rankautonomous.com'] = {
    status: 200,
    body: homeHtml
  };
  mockFetchMap['https://regression.rankautonomous.com/'] = {
    status: 200,
    body: homeHtml
  };
  mockFetchMap['https://regression.rankautonomous.com/robots.txt'] = {
    status: 200,
    body: 'User-agent: *\nAllow: /'
  };

  let failSite: any = null;

  try {
    // -------------------------------------------------------------------------
    // Requirement 1 & 8: Website CONNECTED does not imply crawl COMPLETED
    // And un-crawled site reports NOT_STARTED, not FAILED
    // -------------------------------------------------------------------------
    const ctxInitialCrawl = await dispatchWebsiteRoute('GET', `/${siteA.id}/crawl`, authUserA);
    assert(ctxInitialCrawl.getStatus() === 200, 'Requirement 2: GET /:id/crawl on un-crawled website returns 200');
    assert(
      ctxInitialCrawl.getData()?.status === 'NOT_STARTED',
      'Requirement 2: Un-crawled website status is NOT_STARTED (never falsely marked FAILED)'
    );
    assert(
      ctxInitialCrawl.getData()?.crawledUrls === 0 && ctxInitialCrawl.getData()?.totalUrls === 0,
      'Requirement 2: Un-crawled website has 0 crawled and 0 total urls'
    );

    // Verify Requirement 8: Website status CONNECTED does not allow starting SEO audit
    const ctxAuditPremature = await dispatchWebsiteRoute('POST', `/${siteA.id}/audit`, authUserA);
    assert(
      ctxAuditPremature.getStatus() === 400,
      'Requirement 8: Website CONNECTED does not imply crawl COMPLETED (attempting audit before completed crawl returns 400)'
    );

    // -------------------------------------------------------------------------
    // Requirement 1: Dashboard audit action has a valid action (POST /:id/crawl)
    // -------------------------------------------------------------------------
    const ctxStartCrawl = await dispatchWebsiteRoute('POST', `/${siteA.id}/crawl`, authUserA);
    assert(ctxStartCrawl.getStatus() === 202, 'Requirement 1: Dashboard audit action initiates crawl (POST /:id/crawl returns 202)');
    const crawlJobId1 = ctxStartCrawl.getData()?.crawlJobId;
    assert(!!crawlJobId1, 'Requirement 1: Returned valid crawlJobId');

    // -------------------------------------------------------------------------
    // Requirement 6: Successful crawl reaches COMPLETED & website ACTIVE
    // -------------------------------------------------------------------------
    await startCrawl(siteA.id, crawlJobId1, siteA.url);
    const completedJob1 = await prisma.crawlJob.findUnique({ where: { id: crawlJobId1 } });
    const siteAfterCrawl1 = await prisma.website.findUnique({ where: { id: siteA.id } });

    assert(completedJob1?.status === 'COMPLETED', 'Requirement 6: Successful crawl reaches status COMPLETED');
    assert((completedJob1?.crawledUrls || 0) >= 1, 'Requirement 6: Crawled URLs count >= 1');
    assert(siteAfterCrawl1?.status === 'ACTIVE', 'Requirement 6: Website status becomes ACTIVE after successful crawl');

    // -------------------------------------------------------------------------
    // Requirement 7: Completed crawl can start SEO audit
    // -------------------------------------------------------------------------
    const ctxStartAudit = await dispatchWebsiteRoute('POST', `/${siteA.id}/audit`, authUserA);
    assert(ctxStartAudit.getStatus() === 202, 'Requirement 7: Completed crawl can start SEO audit (POST /:id/audit returns 202)');
    const auditId = ctxStartAudit.getData()?.auditId;
    assert(!!auditId, 'Requirement 7: Audit ID returned successfully');

    // Run audit synchronously
    await startSeoAudit(auditId);
    const auditRecord = await prisma.seoAudit.findUnique({ where: { id: auditId } });
    assert(auditRecord?.status === 'COMPLETED', 'Requirement 7: SEO audit runs and reaches COMPLETED');

    // -------------------------------------------------------------------------
    // Requirement 3 & 4: Root crawl failure increments failed count & persists error
    // -------------------------------------------------------------------------
    failSite = await prisma.website.create({
      data: {
        userId: userA.id,
        url: 'https://fail-test.rankautonomous.com',
        name: 'Fail Site',
        platform: 'Other',
        status: 'CONNECTED',
      }
    });

    mockDnsMap['fail-test.rankautonomous.com'] = '93.184.216.35';
    // Root page returns 500 error
    mockFetchMap['https://fail-test.rankautonomous.com'] = {
      status: 500,
      body: 'Internal Server Error'
    };
    mockFetchMap['https://fail-test.rankautonomous.com/'] = {
      status: 500,
      body: 'Internal Server Error'
    };
    mockFetchMap['https://fail-test.rankautonomous.com/robots.txt'] = {
      status: 200,
      body: 'User-agent: *\nAllow: /'
    };

    const ctxStartFail = await dispatchWebsiteRoute('POST', `/${failSite.id}/crawl`, authUserA);
    const failJobId = ctxStartFail.getData()?.crawlJobId;

    await startCrawl(failSite.id, failJobId, failSite.url);
    const failedJobRecord = await prisma.crawlJob.findUnique({ where: { id: failJobId } });
    const failSiteRecord = await prisma.website.findUnique({ where: { id: failSite.id } });

    assert(failedJobRecord?.status === 'FAILED', 'Requirement 3: Failed crawl job marks status FAILED');
    assert(
      (failedJobRecord?.failedUrls || 0) >= 1,
      `Requirement 3: Root crawl failure increments failedUrls (expected >= 1, got ${failedJobRecord?.failedUrls})`
    );
    assert(
      failedJobRecord?.crawledUrls === 0,
      'Requirement 3: Failed root crawl leaves crawledUrls at 0'
    );
    assert(
      !!failedJobRecord?.errorMessage && failedJobRecord.errorMessage.includes('HTTP Error 500'),
      `Requirement 4: Crawl error is persisted in errorMessage ("${failedJobRecord?.errorMessage}")`
    );
    assert(
      failSiteRecord?.status === 'ERROR',
      'Requirement 4: Website status becomes ERROR on crawl failure'
    );

    // -------------------------------------------------------------------------
    // Requirement 5: Retry starts a new crawl job
    // -------------------------------------------------------------------------
    const ctxRetry = await dispatchWebsiteRoute('POST', `/${failSite.id}/crawl`, authUserA);
    assert(ctxRetry.getStatus() === 202, 'Requirement 5: Retry starts a new crawl (POST /:id/crawl returns 202)');
    const retryJobId = ctxRetry.getData()?.crawlJobId;
    assert(retryJobId !== failJobId, 'Requirement 5: Retry creates a distinct new CrawlJob ID');

    // -------------------------------------------------------------------------
    // Requirement 9: Failed crawl does not produce a fake SEO score
    // -------------------------------------------------------------------------
    const auditOnFailedCrawl = await dispatchWebsiteRoute('POST', `/${failSite.id}/audit`, authUserA);
    assert(
      auditOnFailedCrawl.getStatus() === 400,
      'Requirement 9: Failed crawl prevents starting an SEO audit'
    );
    const auditsForFailSite = await prisma.seoAudit.findMany({ where: { websiteId: failSite.id } });
    assert(
      auditsForFailSite.length === 0,
      'Requirement 9: Failed crawl does not produce any fake SEO score or audit records'
    );

    // -------------------------------------------------------------------------
    // Requirement 10: Strict Tenant Isolation
    // -------------------------------------------------------------------------
    const ctxCrossUserCrawl = await dispatchWebsiteRoute('POST', `/${siteA.id}/crawl`, authUserB);
    assert(ctxCrossUserCrawl.getStatus() === 404, 'Requirement 10: User B cannot start crawl on User A site (404)');

    const ctxCrossUserGetCrawl = await dispatchWebsiteRoute('GET', `/${siteA.id}/crawl`, authUserB);
    assert(ctxCrossUserGetCrawl.getStatus() === 404, 'Requirement 10: User B cannot view crawl of User A site (404)');

    const ctxCrossUserAudit = await dispatchWebsiteRoute('POST', `/${siteA.id}/audit`, authUserB);
    assert(ctxCrossUserAudit.getStatus() === 404, 'Requirement 10: User B cannot trigger audit on User A site (404)');

    console.log('==================================================');
    console.log('ALL 10 CRAWL & AUDIT REGRESSION TESTS PASSED!');
    console.log('==================================================');
  } finally {
    // Cleanup test data
    dns.lookup = originalLookup;
    global.fetch = originalFetch;
    await prisma.seoIssue.deleteMany({ where: { websiteId: { in: [siteA.id, failSite?.id].filter(Boolean) } } });
    await prisma.seoAudit.deleteMany({ where: { websiteId: { in: [siteA.id, failSite?.id].filter(Boolean) } } });
    await prisma.pageResult.deleteMany({ where: { crawlJob: { websiteId: { in: [siteA.id, failSite?.id].filter(Boolean) } } } });
    await prisma.crawlJob.deleteMany({ where: { websiteId: { in: [siteA.id, failSite?.id].filter(Boolean) } } });
    await prisma.website.deleteMany({ where: { id: { in: [siteA.id, failSite?.id].filter(Boolean) } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
}

runRegressionTests()
  .catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
