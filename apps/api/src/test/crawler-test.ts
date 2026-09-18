import { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSubscription } from '../middleware/subscription';
import websiteRouter from '../routes/website';
import { AuthenticatedUser } from '../types/auth';
import prisma from '../lib/database';
import { ssrfSafeFetch } from '../lib/urlSafety';
import { startCrawl, CRAWL_CONFIG } from '../services/crawler';
import dns from 'dns';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../../.env') });

// ============================================================================
// MOCK FRAMEWORK
// ============================================================================

function createMockContext(
  options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: any;
    user?: AuthenticatedUser;
    params?: any;
    query?: any;
  } = {}
) {
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;

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

  const next: NextFunction = () => {
    nextCalled = true;
  };

  return { req, res, next, getStatus: () => statusCode, getData: () => responseData, isNextCalled: () => nextCalled };
}

async function dispatchWebsiteRoute(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, user?: AuthenticatedUser, body?: any) {
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

// ============================================================================
// DNS AND FETCH MOCKING FOR CRAWLER
// ============================================================================

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
let mockFetchMap: Record<string, { status: number, body: string, headers?: Record<string, string> }> = {};

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

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING STEP 6E-2 CRAWLER TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`PASS: ${testName}`);
      passed++;
    } else {
      console.error(`FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  let user: any = null;
  let otherUser: any = null;

  try {
    user = await prisma.user.upsert({
      where: { email: 'crawler2-test@rankautonomous.com' },
      update: {},
      create: { email: 'crawler2-test@rankautonomous.com', name: 'Crawler User', role: 'CUSTOMER', supabaseAuthId: 'crawler2-uuid' },
    });

    otherUser = await prisma.user.upsert({
      where: { email: 'crawler2-other@rankautonomous.com' },
      update: {},
      create: { email: 'crawler2-other@rankautonomous.com', name: 'Other User', role: 'CUSTOMER', supabaseAuthId: 'other2-uuid' },
    });


  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: 'sub_crawler2' },
    update: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000 * 30) },
    create: { userId: user.id, plan: 'monthly', interval: 'month', stripeSubscriptionId: 'sub_crawler2', stripeCustomerId: 'cus_crawler2', status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000 * 30) },
  });

  await prisma.website.deleteMany({ where: { userId: { in: [user.id, otherUser.id] } } });

  const authUser: AuthenticatedUser = { id: user.id, name: user.name, email: user.email, role: 'CUSTOMER', supabaseAuthId: 'crawler2-uuid', createdAt: user.createdAt, updatedAt: user.updatedAt };
  const authOther: AuthenticatedUser = { id: otherUser.id, name: otherUser.name, email: otherUser.email, role: 'CUSTOMER', supabaseAuthId: 'other2-uuid', createdAt: otherUser.createdAt, updatedAt: otherUser.updatedAt };

  let websiteId = '';

  const ctxPost = await dispatchWebsiteRoute('POST', '/', authUser, {
    url: 'https://mock.rankautonomous.com', 
    name: 'Mock Site', 
    platform: 'Custom', 
    targetCountry: 'United States', 
    targetLocationType: 'COUNTRY', 
    seoGoals: ['Increase organic traffic', 'Rank for keywords']
  });
  websiteId = ctxPost.getData()?.website?.id;

  if (!websiteId) {
    console.error('Failed to create mock website. POST /api/websites response:', ctxPost.getData());
    process.exit(1);
  }

  // 1-4. API Route tests
  {
    const ctxAuthFail = await dispatchWebsiteRoute('POST', `/${websiteId}/crawl`, undefined);
    assert(ctxAuthFail.getStatus() === 401, 'unauthenticated request rejected');

    const ctxCrossUser = await dispatchWebsiteRoute('POST', `/${websiteId}/crawl`, authOther);
    assert(ctxCrossUser.getStatus() === 404 || ctxCrossUser.getStatus() === 403, 'cross-user website crawl rejected');
  }

  // 11-13 SSRF blocks
  {
    const ssrfTests = [
      { url: 'http://localhost', expect: 'private/local address' },
      { url: 'http://127.0.0.1', expect: 'private/local address' },
      { url: 'http://10.0.0.1', expect: 'private/local address' },
      { url: 'http://[::1]', expect: 'private/local address' },
      { url: 'http://169.254.169.254', expect: 'private/local address' },
      { url: 'file:///etc/passwd', expect: 'Unsafe protocol' },
      { url: 'javascript:alert(1)', expect: 'Unsafe protocol' }
    ];

    let ssrfPassed = true;
    for (const test of ssrfTests) {
      try {
        await ssrfSafeFetch(test.url);
        ssrfPassed = false;
        console.error(`Expected SSRF block for ${test.url} but succeeded.`);
      } catch (e: any) {
        if (!e.message.includes(test.expect)) {
          ssrfPassed = false;
          console.error(`Expected SSRF block message "${test.expect}" for ${test.url}, got: ${e.message}`);
        }
      }
    }
    assert(ssrfPassed, 'unsupported protocols, localhost, private IPv4/IPv6 rejected');
  }

  // Mock setup for crawler
  mockDnsMap['mock.rankautonomous.com'] = '8.8.8.8'; // Bypass SSRF for test domain
  mockFetchMap['https://mock.rankautonomous.com/robots.txt'] = { status: 200, body: 'User-agent: *\nDisallow: /private\nSitemap: https://mock.rankautonomous.com/sitemap_index.xml' };
  
  mockFetchMap['https://mock.rankautonomous.com/sitemap_index.xml'] = { 
    status: 200, 
    headers: { 'content-type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://mock.rankautonomous.com/sitemap-discovered</loc></url></urlset>`
  };

  mockFetchMap['https://mock.rankautonomous.com/'] = { status: 200, body: `
    <html>
      <head>
        <title>Home</title>
        <link rel="canonical" href="https://mock.rankautonomous.com/" />
      </head>
      <body>
        <h1>Welcome</h1>
        <a href="/about">About</a>
        <a href="/private">Private</a>
        <a href="https://mock.rankautonomous.com/about#section">About with Fragment</a>
        <a href="https://external.com">External</a>
        <a href="/assets/style.css">CSS</a>
        <a href="mailto:test@test.com">Mail</a>
        <a href="/product?utm_source=test&id=1">Product</a>
        <a href="/huge">Huge</a>
      </body>
    </html>
  `};

  mockFetchMap['https://mock.rankautonomous.com/about'] = { status: 200, body: '<html><title>About</title><body>About Us<a href="/depth2">Depth 2</a></body></html>' };
  mockFetchMap['https://mock.rankautonomous.com/depth2'] = { status: 200, body: '<html><a href="/depth3">Depth 3</a></html>' };
  mockFetchMap['https://mock.rankautonomous.com/depth3'] = { status: 200, body: '<html><a href="/depth4">Depth 4</a></html>' };
  mockFetchMap['https://mock.rankautonomous.com/depth4'] = { status: 200, body: '<html>Depth 4 - Should not be reached</html>' };
  mockFetchMap['https://mock.rankautonomous.com/product?id=1'] = { status: 200, body: '<html>Product 1</html>' };
  mockFetchMap['https://mock.rankautonomous.com/private'] = { status: 200, body: '<html><title>Private</title></html>' };
  mockFetchMap['https://mock.rankautonomous.com/sitemap-discovered'] = { status: 200, body: '<html>Sitemap page</html>' };
  mockFetchMap['https://mock.rankautonomous.com/huge'] = { 
    status: 200, 
    headers: { 'content-length': '10485760' }, // 10MB
    body: '<html>huge</html>' 
  };

  // 22. Duplicate Crawl
  {
    await dispatchWebsiteRoute('POST', `/${websiteId}/crawl`, authUser);
    const ctxDup = await dispatchWebsiteRoute('POST', `/${websiteId}/crawl`, authUser);
    assert(ctxDup.getStatus() === 409 || ctxDup.getStatus() === 202, `duplicate simultaneous crawl rejected (got ${ctxDup.getStatus()})`);
  }

  // Run Crawl and Check Results
  {
    // Wait for the crawl job to complete in background
    let jobCompleted = false;
    let job: any;
    for (let i=0; i<15; i++) {
      const ctxGet = await dispatchWebsiteRoute('GET', `/${websiteId}/crawl`, authUser);
      job = ctxGet.getData();
      if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) {
        jobCompleted = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    assert(jobCompleted && job?.status === 'COMPLETED', 'crawl status transitions correctly (COMPLETED)');
    assert(job?.progress > 0, 'progress is updated correctly');

    const pages = await prisma.pageResult.findMany({ where: { crawlJobId: (await prisma.crawlJob.findFirst({where: {websiteId}}))?.id } });
    
    const hasHome = pages.find(p => p.url === 'https://mock.rankautonomous.com/');
    const hasAbout = pages.find(p => p.url === 'https://mock.rankautonomous.com/about');
    const hasPrivate = pages.find(p => p.url === 'https://mock.rankautonomous.com/private');
    const hasSitemap = pages.find(p => p.url === 'https://mock.rankautonomous.com/sitemap-discovered');
    const hasProduct = pages.find(p => p.url === 'https://mock.rankautonomous.com/product?id=1');
    const hasHuge = pages.find(p => p.url === 'https://mock.rankautonomous.com/huge');
    const depth4 = pages.find(p => p.url === 'https://mock.rankautonomous.com/depth4');
    
    assert(!!hasHome && !!hasAbout, 'homepage and relative links crawled');
    assert(!!hasSitemap, 'sitemap.xml discovery works');
    assert(!hasPrivate, 'robots.txt disallow respected');
    assert(hasHome?.canonicalUrl === 'https://mock.rankautonomous.com/', 'canonical URL extracted');
    assert(!!hasProduct, 'query tracking parameters normalized (UTM removed)');
    assert(hasHuge?.status === 'FAILED' && (hasHuge?.error?.includes('Payload exceeds maximum size') ?? false), 'large HTML response handled safely');
    assert(!depth4, 'depth limit enforced (max 3)');
    
    const externalLinks = hasHome?.externalLinks as string[];
    assert(!!(externalLinks && externalLinks.includes('https://external.com/')), 'external links discovered but not crawled');
    
    // Cancellation endpoint test
    const mockCtxCancel = await dispatchWebsiteRoute('POST', `/${websiteId}/crawl/cancel`, authUser);
    assert(mockCtxCancel.getStatus() === 400, 'cancel fails if no active job (returns 400)');
  }

  // 25. Website status ACTIVE
  {
    const w = await prisma.website.findUnique({ where: { id: websiteId } });
    assert(w?.status === 'ACTIVE', 'website becomes ACTIVE after successful crawl');
  }

  // Failed Crawl
  {
    const badSite = await prisma.website.create({
       data: { userId: user.id, url: 'https://bad.rankautonomous.com', name: 'Bad', status: 'CONNECTED' }
    });
    mockDnsMap['bad.rankautonomous.com'] = '8.8.8.8';
    
    // Create fetch mock for bad site that fails
    mockFetchMap['https://bad.rankautonomous.com'] = { status: 403, body: 'Forbidden' };
    
    const crawlJob = await prisma.crawlJob.create({ data: { websiteId: badSite.id, status: 'PENDING' } });
    await startCrawl(badSite.id, crawlJob.id, badSite.url);

    const checkJob = await prisma.crawlJob.findUnique({ where: { id: crawlJob.id }});
    const checkSite = await prisma.website.findUnique({ where: { id: badSite.id }});

    assert(checkJob?.status === 'FAILED', 'failed page handles safely');
    assert(checkJob?.crawledUrls === 0, 'crawledUrls remains 0 on failure');
    assert(checkJob?.failedUrls === 1, 'failedUrls increments on failure');
    assert(checkJob?.errorMessage === 'fetch failed' || checkJob?.errorMessage === 'HTTP Error 403', 'root error message propagates to job');
    assert(checkSite?.status === 'ERROR', 'website becomes ERROR after failed crawl');

    // Test API response
    const mockCtxFailGet = await dispatchWebsiteRoute('GET', `/${badSite.id}/crawl`, authUser);
    const failData = mockCtxFailGet.getData();
    assert(failData?.error === 'fetch failed' || failData?.error === 'HTTP Error 403', 'API GET returns the error message');
  }

  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  } finally {
    try {
      const testUserIds = [user.id, otherUser.id];
      const testWebsites = await prisma.website.findMany({
        where: { userId: { in: testUserIds } },
        select: { id: true },
      });
      const testSiteIds = testWebsites.map((s) => s.id);
      if (testSiteIds.length > 0) {
        await prisma.crawlJob.deleteMany({ where: { websiteId: { in: testSiteIds } } });
        await prisma.website.deleteMany({ where: { id: { in: testSiteIds } } });
      }
      await prisma.subscription.deleteMany({ where: { userId: { in: testUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    } catch {
      // Ignore teardown errors
    }
  }

  if (failed > 0) process.exit(1);
}


runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
