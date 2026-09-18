import { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSubscription } from '../middleware/subscription';
import websiteRouter, {
  validateAndNormalizeUrl,
  validateWebsiteFields,
} from '../routes/website';
import { AuthenticatedUser } from '../types/auth';
import prisma from '../lib/database';

/**
 * Lightweight mock helper for Express Request and Response
 */
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

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getData: () => responseData,
    isNextCalled: () => nextCalled,
  };
}

/**
 * Dispatches a request through the Express websiteRouter
 */
async function dispatchWebsiteRoute(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  user?: AuthenticatedUser,
  body?: any
) {
  const ctx = createMockContext({ method, url, user, body });
  await new Promise<void>((resolve) => {
    const origJson = ctx.res.json;
    ctx.res.json = function (data: any) {
      origJson.call(this, data);
      resolve();
      return this;
    };
    const origSend = ctx.res.send;
    ctx.res.send = function (data: any) {
      origSend.call(this, data);
      resolve();
      return this;
    };
    (websiteRouter as any)(ctx.req, ctx.res, () => {
      resolve();
    });
  });
  return ctx;
}

async function runWebsiteTests() {
  console.log('==================================================');
  console.log('RUNNING STEP 6B WEBSITE DATA MODEL & API TESTS');
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

  // ---------------------------------------------------------------------------
  // Setup Test Data
  // ---------------------------------------------------------------------------
  const userA = await prisma.user.upsert({
    where: { email: 'test-owner-a@rankautonomous.com' },
    update: {},
    create: {
      email: 'test-owner-a@rankautonomous.com',
      name: 'Owner A (Subscribed)',
      role: 'CUSTOMER',
      supabaseAuthId: 'test-uuid-owner-a',
    },
  });

  const userB = await prisma.user.upsert({
    where: { email: 'test-owner-b@rankautonomous.com' },
    update: {},
    create: {
      email: 'test-owner-b@rankautonomous.com',
      name: 'Owner B (Subscribed Tenant B)',
      role: 'CUSTOMER',
      supabaseAuthId: 'test-uuid-owner-b',
    },
  });

  const unsubscribedUser = await prisma.user.upsert({
    where: { email: 'test-unsubscribed@rankautonomous.com' },
    update: {},
    create: {
      email: 'test-unsubscribed@rankautonomous.com',
      name: 'Unsubscribed User',
      role: 'CUSTOMER',
      supabaseAuthId: 'test-uuid-unsubscribed',
    },
  });

  // Ensure userA and userB have active subscriptions
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: 'sub_test_owner_a' },
    update: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000 * 30) },
    create: {
      userId: userA.id,
      plan: 'monthly',
      interval: 'month',
      stripeSubscriptionId: 'sub_test_owner_a',
      stripeCustomerId: 'cus_test_owner_a',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
    },
  });

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: 'sub_test_owner_b' },
    update: { status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000 * 30) },
    create: {
      userId: userB.id,
      plan: 'monthly',
      interval: 'month',
      stripeSubscriptionId: 'sub_test_owner_b',
      stripeCustomerId: 'cus_test_owner_b',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
    },
  });

  // Ensure unsubscribedUser has NO active subscription
  await prisma.subscription.deleteMany({
    where: { userId: unsubscribedUser.id },
  });

  // Clean up any existing test websites for these users
  await prisma.website.deleteMany({
    where: { userId: { in: [userA.id, userB.id, unsubscribedUser.id] } },
  });

  const authUserA: AuthenticatedUser = {
    id: userA.id,
    name: userA.name,
    email: userA.email,
    role: userA.role as 'CUSTOMER' | 'ADMIN',
    supabaseAuthId: userA.supabaseAuthId || 'test-uuid-owner-a',
    createdAt: userA.createdAt,
    updatedAt: userA.updatedAt,
  };

  const authUserB: AuthenticatedUser = {
    id: userB.id,
    name: userB.name,
    email: userB.email,
    role: userB.role as 'CUSTOMER' | 'ADMIN',
    supabaseAuthId: userB.supabaseAuthId || 'test-uuid-owner-b',
    createdAt: userB.createdAt,
    updatedAt: userB.updatedAt,
  };

  const authUnsubscribed: AuthenticatedUser = {
    id: unsubscribedUser.id,
    name: unsubscribedUser.name,
    email: unsubscribedUser.email,
    role: unsubscribedUser.role as 'CUSTOMER' | 'ADMIN',
    supabaseAuthId: unsubscribedUser.supabaseAuthId || 'test-uuid-unsubscribed',
    createdAt: unsubscribedUser.createdAt,
    updatedAt: unsubscribedUser.updatedAt,
  };

  let createdWebsiteId: string = '';

  // ---------------------------------------------------------------------------
  // Test 1: Unauthenticated GET /api/websites -> 401
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext();
    await requireAuth(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && ctx.getData()?.error === 'Unauthorized',
      'Test 1: Unauthenticated GET /api/websites returns 401'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 2: Unauthenticated POST /api/websites -> 401
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({ body: { url: 'https://mysite.com', name: 'My Site' } });
    await requireAuth(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && ctx.getData()?.error === 'Unauthorized',
      'Test 2: Unauthenticated POST /api/websites returns 401'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3: Customer without active subscription cannot create website -> 403
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({ user: authUnsubscribed, body: { url: 'https://mysite.com', name: 'My Site' } });
    await requireSubscription(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 403 && ctx.getData()?.code === 'SUBSCRIPTION_REQUIRED',
      'Test 3: Customer without active subscription cannot create website (403)'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 4: Active customer can create website
  // ---------------------------------------------------------------------------
  {
    const payload = {
      url: 'https://growth-engine.io',
      name: 'Growth Engine',
      industry: 'Technology',
      targetCountry: 'United States',
      targetAudience: 'Startups & Scaleups',
      description: 'AI-driven inbound growth engine.',
      seoGoals: ['Increase organic traffic', 'Rank for keywords'],
      targetLocationType: 'COUNTRY',
      primaryKeywords: ['SEO Automation', 'Organic Growth'],
      platform: 'WordPress',
    };

    const ctx = await dispatchWebsiteRoute('POST', '/', authUserA, payload);
    const data = ctx.getData();
    createdWebsiteId = data?.website?.id || '';

    assert(
      ctx.getStatus() === 201 &&
        data?.website?.id &&
        data?.website?.url === 'https://growth-engine.io' &&
        data?.website?.name === 'Growth Engine' &&
        data?.website?.status === 'CONNECTED',
      'Test 4: Active customer can create website'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 5: Website owner can list their websites
  // ---------------------------------------------------------------------------
  {
    const ctx = await dispatchWebsiteRoute('GET', '/', authUserA);
    const data = ctx.getData();
    assert(
      ctx.getStatus() === 200 &&
        Array.isArray(data?.websites) &&
        data.websites.some((w: any) => w.id === createdWebsiteId),
      'Test 5: Website owner can list their websites'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 6: User B cannot retrieve User A's website -> 404
  // ---------------------------------------------------------------------------
  {
    const ctx = await dispatchWebsiteRoute('GET', `/${createdWebsiteId}`, authUserB);
    assert(
      ctx.getStatus() === 404 && ctx.getData()?.error === 'Not Found',
      "Test 6: User B cannot retrieve User A's website (404)"
    );
  }

  // ---------------------------------------------------------------------------
  // Test 7: User B cannot update User A's website -> 404
  // ---------------------------------------------------------------------------
  {
    const ctx = await dispatchWebsiteRoute('PUT', `/${createdWebsiteId}`, authUserB, {
      name: 'Malicious Rename',
    });
    assert(
      ctx.getStatus() === 404 && ctx.getData()?.error === 'Not Found',
      "Test 7: User B cannot update User A's website (404)"
    );
  }

  // ---------------------------------------------------------------------------
  // Test 8: User B cannot disconnect User A's website -> 404
  // ---------------------------------------------------------------------------
  {
    const ctx = await dispatchWebsiteRoute('DELETE', `/${createdWebsiteId}`, authUserB);
    assert(
      ctx.getStatus() === 404 && ctx.getData()?.error === 'Not Found',
      "Test 8: User B cannot disconnect User A's website (404)"
    );
  }

  // ---------------------------------------------------------------------------
  // Test 9: Invalid URL and SSRF targets are rejected
  // ---------------------------------------------------------------------------
  {
    const dangerousUrl = validateAndNormalizeUrl('javascript:alert(1)');
    const localhostUrl = validateAndNormalizeUrl('http://localhost:3000');
    const privateIpUrl = validateAndNormalizeUrl('https://192.168.1.1/test');
    const noTldUrl = validateAndNormalizeUrl('https://invalidserver');

    assert(
      !dangerousUrl.valid && !localhostUrl.valid && !privateIpUrl.valid && !noTldUrl.valid,
      'Test 9: Invalid URL and SSRF targets are rejected'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 10: Unsupported SEO goal is rejected
  // ---------------------------------------------------------------------------
  {
    const validation = validateWebsiteFields({
      name: 'Test Site',
      seoGoals: ['Increase organic traffic', 'Arbitrary Unsupported Goal'],
    });

    assert(
      !validation.valid && validation.errors.some((e) => e.includes('Arbitrary Unsupported Goal')),
      'Test 10: Unsupported SEO goal is rejected (422)'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 11: Invalid targetLocationType is rejected
  // ---------------------------------------------------------------------------
  {
    const validation = validateWebsiteFields({
      name: 'Test Site',
      targetLocationType: 'GALACTIC',
    });

    assert(
      !validation.valid && validation.errors.some((e) => e.includes('Invalid target location type')),
      'Test 11: Invalid targetLocationType is rejected (422)'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 12: Invalid platform is rejected
  // ---------------------------------------------------------------------------
  {
    const validation = validateWebsiteFields({
      name: 'Test Site',
      platform: 'Wix', // Allowed: WordPress, Shopify, Webflow, Custom, Other
    });

    assert(
      !validation.valid && validation.errors.some((e) => e.includes('Invalid platform')),
      'Test 12: Invalid platform is rejected (422)'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 13: CITY location requires country + region + city
  // ---------------------------------------------------------------------------
  {
    const missingFields = validateWebsiteFields({
      name: 'Local Business',
      targetLocationType: 'CITY',
      targetCountry: 'United States',
      // missing region and city
    });

    const completeFields = validateWebsiteFields({
      name: 'Local Business',
      targetLocationType: 'CITY',
      targetCountry: 'United States',
      targetRegion: 'California',
      targetCity: 'San Francisco',
    });

    assert(
      !missingFields.valid &&
        missingFields.errors.some((e) => e.includes('Target region/state is required')) &&
        missingFields.errors.some((e) => e.includes('Target city is required')) &&
        completeFields.valid,
      'Test 13: CITY location hierarchy requires country + region + city'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 14: Duplicate keywords are normalized and deduplicated
  // ---------------------------------------------------------------------------
  {
    const validation = validateWebsiteFields({
      name: 'Site',
      primaryKeywords: ['  SEO Software  ', 'seo software', 'rank tracking', 'RANK TRACKING', 'ai seo'],
    });

    assert(
      validation.valid &&
        validation.data.primaryKeywords.length === 3 &&
        validation.data.primaryKeywords.includes('SEO Software') &&
        validation.data.primaryKeywords.includes('rank tracking') &&
        validation.data.primaryKeywords.includes('ai seo'),
      'Test 14: Duplicate keywords are normalized and deduplicated'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 15: Website creation always uses authenticated req.user.id
  // ---------------------------------------------------------------------------
  {
    const website = await prisma.website.findUnique({
      where: { id: createdWebsiteId },
    });

    assert(
      website !== null && website.userId === authUserA.id,
      'Test 15: Website creation always uses authenticated req.user.id'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 16: Client cannot submit arbitrary userId
  // ---------------------------------------------------------------------------
  {
    const payload = {
      url: 'https://spoof-attempt.org',
      name: 'Spoof Site',
      userId: 'some-other-hacked-uuid', // Should be completely ignored
    };

    const ctx = await dispatchWebsiteRoute('POST', '/', authUserA, payload);
    const created = await prisma.website.findFirst({
      where: { url: 'https://spoof-attempt.org' },
    });

    assert(
      created !== null && created.userId === authUserA.id,
      'Test 16: Client cannot submit arbitrary userId (server controls ownership)'
    );

    if (created) {
      await prisma.website.delete({ where: { id: created.id } });
    }
  }

  // ---------------------------------------------------------------------------
  // Test 17: Newly created website starts as CONNECTED
  // ---------------------------------------------------------------------------
  {
    const website = await prisma.website.findUnique({
      where: { id: createdWebsiteId },
    });

    assert(
      website !== null && website.status === 'CONNECTED',
      'Test 17: Newly created website starts as CONNECTED'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 18: DELETE /api/websites/:id disconnects website appropriately
  // ---------------------------------------------------------------------------
  {
    const ctx = await dispatchWebsiteRoute('DELETE', `/${createdWebsiteId}`, authUserA);
    const disconnected = await prisma.website.findUnique({
      where: { id: createdWebsiteId },
    });

    assert(
      ctx.getStatus() === 200 &&
        disconnected !== null &&
        disconnected.status === 'DISCONNECTED',
      'Test 18: DELETE/Disconnect changes status to DISCONNECTED while preserving record'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 19: GET /api/websites/active returns deterministic active website
  // ---------------------------------------------------------------------------
  {
    // Create a website with CONNECTED status for userA
    const activeSite = await prisma.website.create({
      data: {
        userId: userA.id,
        url: 'https://active-alpha.com',
        name: 'Active Alpha',
        status: 'CONNECTED',
      },
    });

    const ctx = await dispatchWebsiteRoute('GET', '/active', authUserA);
    const data = ctx.getData();

    assert(
      ctx.getStatus() === 200 && data?.website?.id === activeSite.id,
      'Test 19: GET /api/websites/active returns deterministic active website'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 20: Sensitive integration credentials are never returned
  // ---------------------------------------------------------------------------
  {
    const testSite = await prisma.website.findFirst({
      where: { userId: userA.id },
    });

    if (testSite) {
      await prisma.integration.create({
        data: {
          websiteId: testSite.id,
          provider: 'WORDPRESS',
          credentials: 'SUPER_SECRET_TOKEN_DO_NOT_EXPOSE',
          status: 'ACTIVE',
        },
      });

      const ctx = await dispatchWebsiteRoute('GET', `/${testSite.id}`, authUserA);
      const returnedIntegrations = ctx.getData()?.website?.integrations;
      const hasCredentials = JSON.stringify(ctx.getData()).includes('SUPER_SECRET_TOKEN_DO_NOT_EXPOSE');

      assert(
        !hasCredentials &&
          returnedIntegrations &&
          returnedIntegrations[0]?.provider === 'WORDPRESS' &&
          returnedIntegrations[0]?.credentials === undefined,
        'Test 20: Sensitive integration credentials are never returned in responses'
      );
    } else {
      assert(false, 'Test 20: Sensitive integration credentials check (test website missing)');
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup test data
  // ---------------------------------------------------------------------------
  const testUserIds = [userA.id, userB.id, unsubscribedUser.id];
  await prisma.website.deleteMany({
    where: { userId: { in: testUserIds } },
  });
  await prisma.subscription.deleteMany({
    where: { userId: { in: testUserIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: testUserIds } },
  });


  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runWebsiteTests()
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
