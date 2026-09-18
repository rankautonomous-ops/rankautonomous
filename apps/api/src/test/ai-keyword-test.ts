import { Request, Response, NextFunction } from 'express';
import websiteRouter from '../routes/website';
import { AuthenticatedUser } from '../types/auth';
import prisma from '../lib/database';
import {
  setAiProvider,
  getAiProvider,
  isGeminiConfigured,
  GeminiProvider,
  IAiProvider,
  AiCompletionOptions,
  AiProviderError,
} from '../services/aiProvider';
import {
  validateAndParseAiKeywords,
  generateKeywordSuggestions,
  AiServiceValidationError,
} from '../services/aiKeywordService';

/**
 * Controllable Mock AI Provider for deterministic testing without external API calls
 */
class MockAiProvider implements IAiProvider {
  public mockResponse: string | null = null;
  public shouldThrow: Error | null = null;
  public lastCall: AiCompletionOptions | null = null;

  async generateCompletion(options: AiCompletionOptions): Promise<string> {
    this.lastCall = options;
    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
    if (this.mockResponse === null) {
      throw new AiProviderError('Mock provider has no response configured.');
    }
    return this.mockResponse;
  }
}

/**
 * Express Request/Response Mock Helper
 */
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
  let nextCalled = false;

  const req = {
    method: options.method || 'POST',
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
 * Dispatches a request through websiteRouter
 */
async function dispatchRoute(
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

async function runAiKeywordTests() {
  console.log('==================================================');
  console.log('RUNNING STEP 6D AI KEYWORD SUGGESTIONS TESTS');
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

  const mockProvider = new MockAiProvider();
  setAiProvider(mockProvider);

  // Setup Test Users in database
  const userA = await prisma.user.upsert({
    where: { email: 'ai-test-owner-a@rankautonomous.com' },
    update: {},
    create: {
      email: 'ai-test-owner-a@rankautonomous.com',
      name: 'AI Test Owner A',
      role: 'CUSTOMER',
      supabaseAuthId: 'ai-test-uuid-a',
    },
  });

  const userB = await prisma.user.upsert({
    where: { email: 'ai-test-owner-b@rankautonomous.com' },
    update: {},
    create: {
      email: 'ai-test-owner-b@rankautonomous.com',
      name: 'AI Test Owner B',
      role: 'CUSTOMER',
      supabaseAuthId: 'ai-test-uuid-b',
    },
  });

  const unsubscribedUser = await prisma.user.upsert({
    where: { email: 'ai-test-unsubscribed@rankautonomous.com' },
    update: {},
    create: {
      email: 'ai-test-unsubscribed@rankautonomous.com',
      name: 'AI Test Unsubscribed',
      role: 'CUSTOMER',
      supabaseAuthId: 'ai-test-uuid-unsubscribed',
    },
  });

  // Ensure active subscriptions for User A & User B
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: 'sub_ai_test_owner_a' },
    update: { status: 'active', currentPeriodEnd: futureDate },
    create: {
      userId: userA.id,
      stripeSubscriptionId: 'sub_ai_test_owner_a',
      stripeCustomerId: 'cus_ai_test_a',
      plan: 'monthly',
      interval: 'month',
      status: 'active',
      currentPeriodEnd: futureDate,
    },
  });

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: 'sub_ai_test_owner_b' },
    update: { status: 'active', currentPeriodEnd: futureDate },
    create: {
      userId: userB.id,
      stripeSubscriptionId: 'sub_ai_test_owner_b',
      stripeCustomerId: 'cus_ai_test_b',
      plan: 'monthly',
      interval: 'month',
      status: 'active',
      currentPeriodEnd: futureDate,
    },
  });

  // Create a website belonging to User A
  const existingWebsiteA = await prisma.website.upsert({
    where: { id: 'ai-test-website-a-id' },
    update: {
      userId: userA.id,
      url: 'https://tenant-a-seo.com',
      name: 'Tenant A SEO Platform',
      primaryKeywords: ['automated seo software', 'rank tracker'],
    },
    create: {
      id: 'ai-test-website-a-id',
      userId: userA.id,
      url: 'https://tenant-a-seo.com',
      name: 'Tenant A SEO Platform',
      industry: 'SaaS / Marketing',
      targetCountry: 'United States',
      primaryKeywords: ['automated seo software', 'rank tracker'],
      status: 'CONNECTED',
    },
  });

  // Sample valid AI response
  const sampleValidAiResponse = JSON.stringify({
    suggestions: [
      {
        keyword: 'enterprise ai seo tool',
        intent: 'commercial',
        rationale: 'Targeting mid-to-enterprise businesses comparing automated SEO tooling.',
      },
      {
        keyword: 'how to automate technical seo audits',
        intent: 'informational',
        rationale: 'Educational query targeting SEO engineers and growth marketers.',
      },
      {
        keyword: 'buy ai backlink software',
        intent: 'transactional',
        rationale: 'High buying intent for link building automation.',
      },
      {
        keyword: 'rankautonomous login',
        intent: 'navigational',
        rationale: 'Branded search query for existing and returning users.',
      },
    ],
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Authenticated request succeeds
  // ---------------------------------------------------------------------------
  mockProvider.mockResponse = sampleValidAiResponse;
  mockProvider.shouldThrow = null;

  const test1 = await dispatchRoute(
    'POST',
    '/keyword-suggestions',
    {
      id: userA.id,
      supabaseAuthId: userA.supabaseAuthId || 'ai-test-uuid-a',
      email: userA.email,
      name: userA.name,
      role: 'CUSTOMER',
      createdAt: userA.createdAt,
      updatedAt: userA.updatedAt,
    },
    {
      websiteUrl: 'https://tenant-a-seo.com',
      businessName: 'Tenant A SEO Platform',
      industry: 'Software',
      seoGoals: ['Increase organic traffic'],
    }
  );

  assert(
    test1.getStatus() === 200 &&
      Array.isArray(test1.getData()?.suggestions) &&
      test1.getData().suggestions.length === 4,
    'Test 1: Authenticated request succeeds with valid suggestions',
    `Status: ${test1.getStatus()}, Data: ${JSON.stringify(test1.getData())}`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Unauthenticated request rejected (401)
  // ---------------------------------------------------------------------------
  const test2 = await dispatchRoute('POST', '/keyword-suggestions', undefined, {
    websiteUrl: 'https://tenant-a-seo.com',
    businessName: 'Tenant A SEO Platform',
  });

  assert(
    test2.getStatus() === 401,
    'Test 2: Unauthenticated request rejected with 401',
    `Status: ${test2.getStatus()}`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Unsubscribed customer rejected (403 SUBSCRIPTION_REQUIRED)
  // ---------------------------------------------------------------------------
  const test3 = await dispatchRoute(
    'POST',
    '/keyword-suggestions',
    {
      id: unsubscribedUser.id,
      supabaseAuthId: unsubscribedUser.supabaseAuthId || 'ai-test-uuid-unsubscribed',
      email: unsubscribedUser.email,
      name: unsubscribedUser.name,
      role: 'CUSTOMER',
      createdAt: unsubscribedUser.createdAt,
      updatedAt: unsubscribedUser.updatedAt,
    },
    {
      websiteUrl: 'https://unsubscribed-domain.com',
      businessName: 'Unsubscribed Domain',
    }
  );

  assert(
    test3.getStatus() === 403 && test3.getData()?.code === 'SUBSCRIPTION_REQUIRED',
    'Test 3: Unsubscribed customer rejected with 403 SUBSCRIPTION_REQUIRED',
    `Status: ${test3.getStatus()}, Code: ${test3.getData()?.code}`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Customer cannot request suggestions for another user's website (404)
  // ---------------------------------------------------------------------------
  const test4 = await dispatchRoute(
    'POST',
    `/${existingWebsiteA.id}/keyword-suggestions`,
    {
      id: userB.id, // User B trying to access User A's website
      supabaseAuthId: userB.supabaseAuthId || 'ai-test-uuid-b',
      email: userB.email,
      name: userB.name,
      role: 'CUSTOMER',
      createdAt: userB.createdAt,
      updatedAt: userB.updatedAt,
    }
  );

  assert(
    test4.getStatus() === 404,
    'Test 4: Customer cannot request suggestions for another user\'s website (tenant isolation 404)',
    `Status: ${test4.getStatus()}`
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Valid AI response is returned with correct structured format
  // ---------------------------------------------------------------------------
  mockProvider.mockResponse = sampleValidAiResponse;
  mockProvider.shouldThrow = null;

  const test5 = await dispatchRoute(
    'POST',
    `/${existingWebsiteA.id}/keyword-suggestions`,
    {
      id: userA.id, // Legitimate owner
      supabaseAuthId: userA.supabaseAuthId || 'ai-test-uuid-a',
      email: userA.email,
      name: userA.name,
      role: 'CUSTOMER',
      createdAt: userA.createdAt,
      updatedAt: userA.updatedAt,
    }
  );

  const suggestions = test5.getData()?.suggestions;
  const hasExpectedFields =
    Array.isArray(suggestions) &&
    suggestions.every(
      (s: any) =>
        typeof s.keyword === 'string' &&
        ['informational', 'commercial', 'transactional', 'navigational'].includes(s.intent) &&
        typeof s.rationale === 'string'
    );

  assert(
    test5.getStatus() === 200 && hasExpectedFields,
    'Test 5: Valid AI response is returned with keyword, intent, and rationale structure',
    `Status: ${test5.getStatus()}, Valid: ${hasExpectedFields}`
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Malformed AI response is rejected safely
  // ---------------------------------------------------------------------------
  mockProvider.mockResponse = '{ "malformed": "not valid keyword schema" }';
  mockProvider.shouldThrow = null;

  const test6 = await dispatchRoute(
    'POST',
    '/keyword-suggestions',
    {
      id: userA.id,
      supabaseAuthId: userA.supabaseAuthId || 'ai-test-uuid-a',
      email: userA.email,
      name: userA.name,
      role: 'CUSTOMER',
      createdAt: userA.createdAt,
      updatedAt: userA.updatedAt,
    },
    {
      websiteUrl: 'https://tenant-a-seo.com',
      businessName: 'Tenant A SEO Platform',
    }
  );

  assert(
    test6.getStatus() === 502 && test6.getData()?.error === 'AI Generation Error',
    'Test 6: Malformed AI response is rejected safely without crashing (502)',
    `Status: ${test6.getStatus()}, Error: ${test6.getData()?.error}`
  );

  // ---------------------------------------------------------------------------
  // TEST 7: AI provider failure is handled safely
  // ---------------------------------------------------------------------------
  mockProvider.shouldThrow = new AiProviderError('AI provider API rate limit exceeded.', 502);

  const test7 = await dispatchRoute(
    'POST',
    '/keyword-suggestions',
    {
      id: userA.id,
      supabaseAuthId: userA.supabaseAuthId || 'ai-test-uuid-a',
      email: userA.email,
      name: userA.name,
      role: 'CUSTOMER',
      createdAt: userA.createdAt,
      updatedAt: userA.updatedAt,
    },
    {
      websiteUrl: 'https://tenant-a-seo.com',
      businessName: 'Tenant A SEO Platform',
    }
  );

  assert(
    test7.getStatus() === 502 && test7.getData()?.error === 'AI Provider Error',
    'Test 7: AI provider failure is handled safely without crashing server (502)',
    `Status: ${test7.getStatus()}, Message: ${test7.getData()?.message}`
  );

  // Reset provider mock
  mockProvider.shouldThrow = null;

  // ---------------------------------------------------------------------------
  // TEST 8: Duplicate keywords are removed (case-insensitively & against existing)
  // ---------------------------------------------------------------------------
  const rawWithDuplicates = JSON.stringify({
    suggestions: [
      { keyword: 'Automated SEO Software', intent: 'commercial', rationale: 'Duplicate of existing keyword' },
      { keyword: 'organic growth', intent: 'informational', rationale: 'First occurrence' },
      { keyword: 'ORGANIC GROWTH', intent: 'commercial', rationale: 'Case-insensitive internal duplicate' },
      { keyword: 'organic growth', intent: 'transactional', rationale: 'Exact duplicate' },
      { keyword: 'new search term', intent: 'transactional', rationale: 'Unique term' },
    ],
  });

  const parsedDedup = validateAndParseAiKeywords(rawWithDuplicates, ['automated seo software']);

  assert(
    parsedDedup.suggestions.length === 2 &&
      parsedDedup.suggestions.some((s) => s.keyword === 'organic growth') &&
      parsedDedup.suggestions.some((s) => s.keyword === 'new search term') &&
      !parsedDedup.suggestions.some((s) => s.keyword === 'automated seo software'),
    'Test 8: Duplicate keywords (internal and existing user keywords) are deduplicated case-insensitively',
    `Returned length: ${parsedDedup.suggestions.length}, Keywords: ${JSON.stringify(parsedDedup.suggestions.map((s) => s.keyword))}`
  );

  // ---------------------------------------------------------------------------
  // TEST 9: Unsupported intent is rejected
  // ---------------------------------------------------------------------------
  const rawWithInvalidIntent = JSON.stringify({
    suggestions: [
      { keyword: 'valid keyword', intent: 'commercial', rationale: 'Valid intent' },
      { keyword: 'invalid intent keyword', intent: 'random_unsupported_intent', rationale: 'Invalid intent' },
      { keyword: 'another valid', intent: 'informational', rationale: 'Valid intent' },
    ],
  });

  const parsedIntent = validateAndParseAiKeywords(rawWithInvalidIntent, []);

  assert(
    parsedIntent.suggestions.length === 2 &&
      !parsedIntent.suggestions.some((s) => s.keyword === 'invalid intent keyword'),
    'Test 9: Suggestions with unsupported search intents are safely rejected/filtered',
    `Remaining: ${parsedIntent.suggestions.map((s) => s.intent).join(', ')}`
  );

  // ---------------------------------------------------------------------------
  // TEST 10: Excessive keyword output is truncated safely
  // ---------------------------------------------------------------------------
  const excessiveList = Array.from({ length: 45 }, (_, i) => ({
    keyword: `strategic seo keyword phrase ${i + 1}`,
    intent: 'commercial',
    rationale: `Rationale for keyword number ${i + 1}`,
  }));

  const rawExcessive = JSON.stringify({ suggestions: excessiveList });
  const parsedExcessive = validateAndParseAiKeywords(rawExcessive, []);

  assert(
    parsedExcessive.suggestions.length === 30,
    'Test 10: Excessive keyword output (>30 suggestions) is truncated safely to 30',
    `Returned count: ${parsedExcessive.suggestions.length}`
  );

  // ---------------------------------------------------------------------------
  // TEST 11: isGeminiConfigured detection
  // ---------------------------------------------------------------------------
  const origProvider = process.env.AI_PROVIDER;
  const origKey = process.env.AI_PROVIDER_API_KEY;
  const origModel = process.env.AI_MODEL_PREFERENCE;

  process.env.AI_PROVIDER = 'gemini';
  const geminiByProvider = isGeminiConfigured();

  delete process.env.AI_PROVIDER;
  process.env.AI_PROVIDER_API_KEY = 'AIzaSyTestGoogleKey12345';
  const geminiByKey = isGeminiConfigured();

  process.env.AI_PROVIDER_API_KEY = 'sk-test-openai-key';
  process.env.AI_MODEL_PREFERENCE = 'gemini-2.0-flash';
  const geminiByModel = isGeminiConfigured();

  // Reset
  if (origProvider !== undefined) process.env.AI_PROVIDER = origProvider; else delete process.env.AI_PROVIDER;
  if (origKey !== undefined) process.env.AI_PROVIDER_API_KEY = origKey; else delete process.env.AI_PROVIDER_API_KEY;
  if (origModel !== undefined) process.env.AI_MODEL_PREFERENCE = origModel; else delete process.env.AI_MODEL_PREFERENCE;

  assert(
    geminiByProvider && geminiByKey && geminiByModel,
    'Test 11: isGeminiConfigured detects Gemini via AI_PROVIDER, AIzaSy key prefix, or gemini model name',
    `Provider: ${geminiByProvider}, Key: ${geminiByKey}, Model: ${geminiByModel}`
  );

  // ---------------------------------------------------------------------------
  // TEST 12: getAiProvider returns GeminiProvider when configured for Gemini
  // ---------------------------------------------------------------------------
  setAiProvider(null); // Clear manual override
  process.env.AI_PROVIDER = 'gemini';
  const providerInstance = getAiProvider();
  const isGeminiInstance = providerInstance instanceof GeminiProvider;

  // Cleanup env
  if (origProvider !== undefined) process.env.AI_PROVIDER = origProvider; else delete process.env.AI_PROVIDER;

  assert(
    isGeminiInstance,
    'Test 12: getAiProvider instantiates GeminiProvider when AI_PROVIDER=gemini',
    `Type: ${providerInstance.constructor.name}`
  );

  // ---------------------------------------------------------------------------
  // Cleanup Test Data
  // ---------------------------------------------------------------------------
  try {
    await prisma.website.deleteMany({
      where: { id: 'ai-test-website-a-id' },
    });
    await prisma.subscription.deleteMany({
      where: { stripeSubscriptionId: { in: ['sub_ai_test_owner_a', 'sub_ai_test_owner_b'] } },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'ai-test-owner-a@rankautonomous.com',
            'ai-test-owner-b@rankautonomous.com',
            'ai-test-unsubscribed@rankautonomous.com',
          ],
        },
      },
    });
  } catch {
    // Non-fatal cleanup
  }

  // Restore active provider
  setAiProvider(null);

  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAiKeywordTests().catch((err) => {
  console.error('Fatal error during AI keyword tests:', err);
  process.exit(1);
});
