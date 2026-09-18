import { Request, Response, NextFunction } from 'express';
import websiteRouter from '../routes/website';
import { AuthenticatedUser } from '../types/auth';
import prisma from '../lib/database';
import { setAiProvider, IAiProvider, AiCompletionOptions, AiProviderError } from '../services/aiProvider';
import { startSeoStrategy } from '../services/seoStrategy';
import { buildStrategyPrompt } from '../services/seoStrategy/prompt';

class MockAiProvider implements IAiProvider {
  public mockResponse: string | null = null;
  public shouldThrow: Error | null = null;

  async generateCompletion(options: AiCompletionOptions): Promise<string> {
    if (this.shouldThrow) throw this.shouldThrow;
    if (this.mockResponse === null) throw new AiProviderError('Mock provider has no response configured.');
    return this.mockResponse;
  }
}

function createMockContext(options: { method?: string; url?: string; headers?: Record<string, string>; body?: any; user?: AuthenticatedUser; params?: any }) {
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
  } as unknown as Request;

  const res = {
    status(code: number) { statusCode = code; return this; },
    json(data: any) { responseData = data; return this; },
  } as unknown as Response;

  const next: NextFunction = () => { nextCalled = true; };

  return { req, res, next, getStatus: () => statusCode, getData: () => responseData, isNextCalled: () => nextCalled };
}

async function dispatchRoute(method: 'GET' | 'POST', url: string, params: any, user: AuthenticatedUser | undefined) {
  const ctx = createMockContext({ method, url, params, user, headers: { authorization: 'Bearer token' } });
  
  await new Promise<void>((resolve, reject) => {
    const origJson = ctx.res.json;
    const origSend = (ctx.res as any).send;
    
    ctx.res.json = function (data: any) {
      origJson.call(this, data);
      resolve();
      return this;
    };
    (ctx.res as any).send = function (data: any) {
      if (origSend) origSend.call(this, data);
      else origJson.call(this, data);
      resolve();
      return this;
    };

    websiteRouter(ctx.req, ctx.res, (err: any) => {
      if (err) reject(err);
      else resolve(); // Unhandled route or next() called
    });
  });
  
  return ctx;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) { console.log(`PASS: ${msg}`); passed++; } 
    else { console.error(`FAIL: ${msg}`); failed++; }
  }

  console.log('\n==================================================');
  console.log('RUNNING STEP 6E-4 AI SEO STRATEGY TESTS');
  console.log('==================================================\n');

  const testUserIds = ['user-strat-1', 'user-strat-2'];
  const cleanSeoStrategyTestData = async () => {
    const testWebsites = await prisma.website.findMany({
      where: { userId: { in: testUserIds } },
      select: { id: true },
    });
    const testWebsiteIds = testWebsites.map((w) => w.id);

    if (testWebsiteIds.length > 0) {
      await prisma.seoStrategy.deleteMany({ where: { websiteId: { in: testWebsiteIds } } });
      await prisma.seoAudit.deleteMany({ where: { websiteId: { in: testWebsiteIds } } });
      await prisma.crawlJob.deleteMany({ where: { websiteId: { in: testWebsiteIds } } });
      await prisma.website.deleteMany({ where: { id: { in: testWebsiteIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  };

  // Setup DB - scoped strictly to test user IDs
  await cleanSeoStrategyTestData();


  const user1 = await prisma.user.create({
    data: { id: 'user-strat-1', supabaseAuthId: 'supa-strat-1', email: 'strat1@test.com', role: 'ADMIN' }
  });
  const user2 = await prisma.user.create({
    data: { id: 'user-strat-2', supabaseAuthId: 'supa-strat-2', email: 'strat2@test.com', role: 'ADMIN' }
  });
  const website = await prisma.website.create({
    data: { userId: user1.id, url: 'https://strat.com', name: 'Strat Site', status: 'ACTIVE' }
  });

  const authUser1: AuthenticatedUser = { id: user1.id, supabaseAuthId: user1.supabaseAuthId as string, email: user1.email, role: user1.role as any, name: null, createdAt: user1.createdAt, updatedAt: user1.updatedAt };
  const authUser2: AuthenticatedUser = { id: user2.id, supabaseAuthId: user2.supabaseAuthId as string, email: user2.email, role: user2.role as any, name: null, createdAt: user2.createdAt, updatedAt: user2.updatedAt };

  const mockAi = new MockAiProvider();
  setAiProvider(mockAi);

  // 1. Requires Completed Crawl
  const res1 = await dispatchRoute('POST', `/${website.id}/strategy`, { id: website.id }, authUser1);
  assert(res1.getStatus() === 400 && res1.getData().message.includes('completed crawl'), 'Test 1: Requires completed crawl');

  const crawl = await prisma.crawlJob.create({
    data: { websiteId: website.id, status: 'COMPLETED', totalUrls: 10, crawledUrls: 10 }
  });

  // 2. Requires Completed Audit
  const res2 = await dispatchRoute('POST', `/${website.id}/strategy`, { id: website.id }, authUser1);
  assert(res2.getStatus() === 400 && res2.getData().message.includes('completed SEO audit'), 'Test 2: Requires completed audit');

  const audit = await prisma.seoAudit.create({
    data: { websiteId: website.id, crawlJobId: crawl.id, status: 'COMPLETED', healthScore: 85 }
  });

  // 3. Tenant Isolation
  const res3 = await dispatchRoute('POST', `/${website.id}/strategy`, { id: website.id }, authUser2);
  assert(res3.getStatus() === 404, 'Test 3: Tenant isolation prevents cross-user generation');

  // 4. Duplicate Generation Prevented
  const stratActive = await prisma.seoStrategy.create({
    data: { websiteId: website.id, crawlJobId: crawl.id, seoAuditId: audit.id, status: 'PENDING' }
  });
  const res4 = await dispatchRoute('POST', `/${website.id}/strategy`, { id: website.id }, authUser1);
  assert(res4.getStatus() === 409 && res4.getData().error === 'Conflict', 'Test 4: Duplicate strategy generation prevented (409)');
  
  await prisma.seoStrategy.deleteMany({ where: { websiteId: website.id } }); // Reset

  // 5. Valid AI JSON Accepted & Parsed
  mockAi.mockResponse = JSON.stringify({
    executiveSummary: 'Great SEO',
    priorityActions: [{ priority: 'CRITICAL', category: 'Tech', action: 'Fix 404', reason: 'Bad UX' }],
    keywordStrategy: { primaryFocus: 'Strat', themes: [] },
    contentStrategy: [],
    internalLinkingStrategy: { pagesNeedingLinks: [], opportunities: [] },
    technicalStrategy: [],
    backlinkStrategy: { approach: 'Good', tactics: [] }
  });

  const stratRecord = await prisma.seoStrategy.create({
    data: { websiteId: website.id, crawlJobId: crawl.id, seoAuditId: audit.id, status: 'PENDING' }
  });
  await startSeoStrategy(stratRecord.id);
  const checkStrat = await prisma.seoStrategy.findUnique({ where: { id: stratRecord.id } });
  assert(!!(checkStrat?.status === 'COMPLETED'), 'Test 5: Valid AI JSON accepted and status marked COMPLETED');
  assert(!!(checkStrat?.crawlJobId === crawl.id && checkStrat?.seoAuditId === audit.id), 'Test 6: Correct crawlJobId and seoAuditId preserved');

  // 7. Malformed JSON Rejected
  const stratBadJson = await prisma.seoStrategy.create({
    data: { websiteId: website.id, crawlJobId: crawl.id, seoAuditId: audit.id, status: 'PENDING' }
  });
  mockAi.mockResponse = 'Not JSON at all';
  await startSeoStrategy(stratBadJson.id);
  const checkBad = await prisma.seoStrategy.findUnique({ where: { id: stratBadJson.id } });
  assert(!!(checkBad?.status === 'FAILED' && checkBad?.error?.includes('invalid JSON')), 'Test 7: Malformed JSON rejected and marked FAILED');

  // 8. Missing Required Field Rejected (Schema Validation)
  const stratMissing = await prisma.seoStrategy.create({
    data: { websiteId: website.id, crawlJobId: crawl.id, seoAuditId: audit.id, status: 'PENDING' }
  });
  mockAi.mockResponse = JSON.stringify({ executiveSummary: 'Missing stuff' });
  await startSeoStrategy(stratMissing.id);
  const checkMissing = await prisma.seoStrategy.findUnique({ where: { id: stratMissing.id } });
  assert(!!(checkMissing?.status === 'FAILED'), 'Test 8: Missing required field rejected (Schema Validation)');

  // 9. Invalid Enum Rejected
  const stratEnum = await prisma.seoStrategy.create({
    data: { websiteId: website.id, crawlJobId: crawl.id, seoAuditId: audit.id, status: 'PENDING' }
  });
  mockAi.mockResponse = JSON.stringify({
    executiveSummary: 'Great SEO',
    priorityActions: [{ priority: 'SUPER_HIGH_FAKE', category: 'Tech', action: 'Fix 404', reason: 'Bad UX' }],
    keywordStrategy: { primaryFocus: 'Strat', themes: [] },
    contentStrategy: [],
    internalLinkingStrategy: { pagesNeedingLinks: [], opportunities: [] },
    technicalStrategy: [],
    backlinkStrategy: { approach: 'Good', tactics: [] }
  });
  await startSeoStrategy(stratEnum.id);
  const checkEnum = await prisma.seoStrategy.findUnique({ where: { id: stratEnum.id } });
  assert(!!(checkEnum?.status === 'FAILED'), 'Test 9: Invalid priority enum rejected');

  // 10. AI Timeout/Provider Failure Handled
  const stratFail = await prisma.seoStrategy.create({
    data: { websiteId: website.id, crawlJobId: crawl.id, seoAuditId: audit.id, status: 'PENDING' }
  });
  mockAi.shouldThrow = new AiProviderError('Timeout', 504);
  await startSeoStrategy(stratFail.id);
  const checkFail = await prisma.seoStrategy.findUnique({ where: { id: stratFail.id } });
  assert(!!(checkFail?.status === 'FAILED' && checkFail?.error?.includes('Timeout')), 'Test 10: AI Provider timeout handled safely');

  // 11. Prompt Architecture enforces no fabrication
  const promptData = buildStrategyPrompt({ website, crawl: { crawledUrls: 1 }, pages: [], audit: { healthScore: 90 }, issues: [] });
  assert(promptData.systemPrompt.includes('Never invent metrics'), 'Test 11: Prompt explicitly forbids metric fabrication');
  assert(promptData.systemPrompt.includes('do NOT generate spam link schemes'), 'Test 12: Prompt explicitly forbids spam backlinks');

  // 13. Completed strategy displayed through API
  const resGet = await dispatchRoute('GET', `/${website.id}/strategy`, { id: website.id }, authUser1);
  assert(resGet.getStatus() === 200 && resGet.getData().strategy.id, 'Test 13: Completed strategy displayed through API');

  // Cleanup strictly test data
  await cleanSeoStrategyTestData();

  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');
  
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
