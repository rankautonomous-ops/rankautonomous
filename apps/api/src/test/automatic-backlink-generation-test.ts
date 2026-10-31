process.env.NODE_ENV = 'test';
import '../lib/env';
import request from 'supertest';
import assert from 'assert';
import app from '../index';
import prisma from '../lib/database';
import supabase from '../lib/supabase';
import { setAiProvider, IAiProvider, AiCompletionOptions } from '../services/aiProvider';
import { executeAutomaticBacklinkGeneration } from '../services/backlinks/automaticBacklinkWorkflow';
import { executeDailyContentGeneration } from '../trigger/dailyContentGeneration';
import { QueueService } from '../services/queue';
import { verifyBacklink } from '../services/backlinks/verifyBacklink';
import * as backlinkFetcher from '../services/backlinks/backlinkFetcher';
import { generateMonthlyReport } from '../services/reports/monthlyReportService';
import { run as runStaleBacklinkEnqueue } from '../cron/enqueueStaleBacklinks';

const TEST_USER_ID = 'test-auto-backlink-user';
const TEST_AUTH_ID = 'test-auto-backlink-auth';
const TEST_WEBSITE_ID = 'test-auto-backlink-site';

class MockBacklinkAiProvider implements IAiProvider {
  async generateCompletion(options: AiCompletionOptions): Promise<string> {
    const text = (options.systemPrompt + ' ' + options.userPrompt).toLowerCase();

    // 1. Backlink Discovery
    if (text.includes('backlink discovery') || text.includes('backlink opportunity candidates') || text.includes('candidates')) {
      return JSON.stringify({
        candidates: [
          {
            url: 'https://moz-tech-seo-resources.com/guide',
            domain: 'moz-tech-seo-resources.com',
            relevance: 92,
            reason: 'Curated technical SEO resource roundup directory',
            type: 'RESOURCE_PAGE',
            valid: true
          },
          {
            url: 'https://dev-journal-insights.io/guest-posts',
            domain: 'dev-journal-insights.io',
            relevance: 84,
            reason: 'Accepts deep technical architecture and search engineering guest posts',
            type: 'GUEST_POST',
            valid: true
          }
        ]
      });
    }

    // 2. Qualification
    if (text.includes('qualification engine') || text.includes('opportunity score')) {
      return JSON.stringify({
        rankAutonomousOpportunityScore: 88,
        relevanceReasoning: 'Strong industry overlap with software engineering and SEO.'
      });
    }

    // 3. Outreach Generation
    if (text.includes('outreach') || text.includes('draft an outreach email')) {
      return JSON.stringify({
        subject: 'Collaboration: Technical SEO Playbook Resource',
        message: 'Hello Editor,\n\nI noticed your comprehensive resource page on technical SEO. We recently published an in-depth playbook that would add value for your readers.\n\nBest,\nEditorial Team'
      });
    }

    // 4. Monthly Report Summary
    if (text.includes('seo analyst') || text.includes('concise 3-4 sentence prose summary')) {
      return 'During this cycle, the blog published 1 article and tracked legitimate backlink prospects. Verified links are active with live status validation.';
    }

    // 5. Article generation fallback
    return JSON.stringify({
      title: 'Mastering Technical SEO: The Autonomous Playbook',
      slug: 'mastering-technical-seo-playbook',
      metaDescription: 'A comprehensive guide to technical SEO and backlink prospecting.',
      content: '# Mastering Technical SEO\n\nTechnical SEO is the foundation of organic visibility...',
      primaryKeyword: 'technical seo',
      secondaryKeywords: ['backlinks', 'crawlability', 'site architecture'],
      targetAudience: 'Software engineers and marketing leaders',
      wordCount: 1500,
      readingTime: 6,
      faq: [
        { question: 'What is technical SEO?', answer: 'It is optimizing server and website architecture.' }
      ]
    });
  }
}

async function setupTestData() {
  await prisma.backgroundJob.deleteMany({
    where: {
      type: { in: ['BACKLINK_VERIFICATION', 'AUTOMATIC_BACKLINK_GENERATION', 'DAILY_CONTENT_GENERATION'] }
    }
  });
  await prisma.backlinkCampaign.deleteMany({ where: { websiteId: TEST_WEBSITE_ID } });
  await prisma.backlinkOpportunity.deleteMany({ where: { websiteId: TEST_WEBSITE_ID } });
  await prisma.backlink.deleteMany({ where: { websiteId: TEST_WEBSITE_ID } });
  await prisma.seoMonthlyReport.deleteMany({ where: { websiteId: TEST_WEBSITE_ID } });
  await prisma.article.deleteMany({ where: { websiteId: TEST_WEBSITE_ID } });
  await prisma.website.deleteMany({ where: { id: TEST_WEBSITE_ID } });
  await prisma.subscription.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });

  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      supabaseAuthId: TEST_AUTH_ID,
      email: 'autobacklink@rankautonomous.com',
      role: 'CUSTOMER'
    }
  });

  await prisma.subscription.create({
    data: {
      userId: TEST_USER_ID,
      plan: 'pro',
      interval: 'month',
      status: 'active'
    }
  });

  await prisma.website.create({
    data: {
      id: TEST_WEBSITE_ID,
      userId: TEST_USER_ID,
      url: 'https://my-saas-platform.com',
      name: 'My SaaS Platform',
      industry: 'Software & Cloud Infrastructure',
      targetAudience: 'Engineering Leaders and CTOs',
      primaryKeywords: ['technical seo', 'cloud monitoring'],
      contentAutomationEnabled: true
    }
  });

  supabase.auth.getUser = async (token: string) => {
    if (token === 'MOCK_TOKEN') {
      return {
        data: {
          user: {
            id: TEST_AUTH_ID,
            email: 'autobacklink@rankautonomous.com',
            user_metadata: { name: 'Test User' }
          }
        },
        error: null
      } as any;
    }
    return { data: { user: null }, error: new Error('Invalid token') } as any;
  };
}

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING AUTOMATIC BACKLINK GENERATION TEST SUITE');
  console.log('==================================================\n');

  setAiProvider(new MockBacklinkAiProvider());
  await setupTestData();

  let passed = 0;
  let failed = 0;

  function assertTest(condition: any, name: string, detail?: any) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`, detail ? detail : '');
      failed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Daily Blog Generation publishes article and queues Automatic Backlink Generation
    // ------------------------------------------------------------------------
    console.log('--- Test 1: Daily Blog Generation triggers Backlink Generation job ---');
    const genResult = await executeDailyContentGeneration({
      websiteId: TEST_WEBSITE_ID,
      autoPublish: true,
      force: true
    });

    assertTest(genResult.success === true, 'Daily content generation executed successfully', genResult);
    assertTest(genResult.published === true, 'Article successfully published');

    const publishedArticle = await prisma.article.findUnique({
      where: { id: genResult.articleId }
    });
    assertTest(publishedArticle?.status === 'PUBLISHED', 'Published article is in status PUBLISHED');

    const backlinkJob = await prisma.backgroundJob.findFirst({
      where: {
        type: 'AUTOMATIC_BACKLINK_GENERATION',
        status: 'QUEUED'
      }
    });
    assertTest(!!backlinkJob, 'AUTOMATIC_BACKLINK_GENERATION job enqueued after article publication');
    assertTest(
      (backlinkJob?.payload as any)?.websiteId === TEST_WEBSITE_ID,
      'Backlink job payload references correct websiteId'
    );

    // ------------------------------------------------------------------------
    // TEST 2: Execute Automatic Backlink Generation Workflow
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Execute Automatic Backlink Generation Workflow ---');
    const workflowResult = await executeAutomaticBacklinkGeneration({
      websiteId: TEST_WEBSITE_ID,
      articleId: publishedArticle!.id,
      topic: publishedArticle!.topic || publishedArticle!.title || undefined,
      keyword: publishedArticle!.primaryKeyword || 'technical seo'
    });

    assertTest(workflowResult.success === true, 'Workflow completed successfully', workflowResult);
    assertTest(workflowResult.discoveredCount === 2, 'Discovered 2 valid prospective domains/pages');
    assertTest(workflowResult.qualifiedCount >= 1, 'Qualified at least 1 prospective opportunity');
    assertTest(workflowResult.campaignsCreated >= 1, 'Created outreach campaigns for high-relevance prospects');

    // ------------------------------------------------------------------------
    // TEST 3: Strict No-Fake-Backlinks Guarantee
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Strict No-Fake-Backlinks Guarantee ---');
    const backlinkCount = await prisma.backlink.count({
      where: { websiteId: TEST_WEBSITE_ID }
    });
    assertTest(
      backlinkCount === 0,
      'Crucial check: Zero fake Backlink records were created during discovery & outreach generation'
    );

    const readyOpportunities = await prisma.backlinkOpportunity.findMany({
      where: { websiteId: TEST_WEBSITE_ID, status: 'READY' },
      include: { campaigns: true }
    });
    assertTest(
      readyOpportunities.length >= 1,
      'Opportunities are tracked in READY state awaiting outreach execution'
    );
    assertTest(
      readyOpportunities[0].campaigns.length >= 1,
      'Outreach campaign draft attached to opportunity'
    );
    assertTest(
      readyOpportunities[0].campaigns[0].message?.includes('Collaboration') ||
      readyOpportunities[0].campaigns[0].subject?.includes('Collaboration'),
      'Tailored outreach message generated'
    );

    // ------------------------------------------------------------------------
    // TEST 4: API Endpoint POST /backlinks/auto-generate
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: API Endpoint POST /backlinks/auto-generate ---');
    const apiRes = await request(app)
      .post(`/api/websites/${TEST_WEBSITE_ID}/backlinks/auto-generate`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ sync: true, topic: 'Cloud Infrastructure SEO' });

    assertTest(apiRes.status === 200, 'POST /backlinks/auto-generate responds with 200');
    assertTest(apiRes.body.success === true, 'Returns workflow success response');

    // ------------------------------------------------------------------------
    // TEST 5: API Endpoint GET /backlinks/summary
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: API Endpoint GET /backlinks/summary ---');
    const summaryRes = await request(app)
      .get(`/api/websites/${TEST_WEBSITE_ID}/backlinks/summary`)
      .set('Authorization', 'Bearer MOCK_TOKEN');

    assertTest(summaryRes.status === 200, 'GET /backlinks/summary responds with 200');
    assertTest(summaryRes.body.opportunities?.total >= 2, 'Summary tracks total discovered opportunities');
    assertTest(summaryRes.body.backlinks?.total === 0, 'Summary accurately reports 0 backlinks before acquisition');

    // ------------------------------------------------------------------------
    // TEST 6: Opportunity Transition to LINK_ACQUIRED creates Backlink with UNVERIFIED
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: Opportunity Transition to LINK_ACQUIRED ---');
    const targetOpp = readyOpportunities[0];

    // Transition READY -> CONTACTED -> REPLIED -> ACCEPTED -> LINK_ACQUIRED
    await prisma.backlinkOpportunity.update({
      where: { id: targetOpp.id },
      data: { status: 'ACCEPTED' }
    });

    const acquireRes = await request(app)
      .patch(`/api/websites/${TEST_WEBSITE_ID}/backlink-opportunities/${targetOpp.id}/status`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({
        status: 'LINK_ACQUIRED',
        sourceUrl: 'https://moz-tech-seo-resources.com/guide',
        targetUrl: 'https://my-saas-platform.com/blog/mastering-technical-seo-playbook'
      });

    assertTest(acquireRes.status === 200, 'Transition to LINK_ACQUIRED succeeds');

    const createdBacklink = await prisma.backlink.findFirst({
      where: { websiteId: TEST_WEBSITE_ID, referringDomain: targetOpp.domain }
    });
    assertTest(!!createdBacklink, 'Backlink tracking record created upon acquisition');
    assertTest(
      createdBacklink?.verificationStatus === 'UNVERIFIED',
      'Crucial check: Newly acquired Backlink strictly starts as UNVERIFIED (not pre-assumed VERIFIED)'
    );

    // ------------------------------------------------------------------------
    // TEST 7: Live Backlink Verification - Link Found -> VERIFIED
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Live Verification - Link Found -> VERIFIED ---');
    const fetchMock = (backlinkFetcher as any).fetchSafely;
    (backlinkFetcher as any).fetchSafely = async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: `
          <html>
            <body>
              <h1>Resource Guide</h1>
              <p>Check out <a href="https://my-saas-platform.com/blog/mastering-technical-seo-playbook" rel="nofollow">Autonomous SEO Guide</a></p>
            </body>
          </html>
        `,
        redirectCount: 0
      };
    };

    await verifyBacklink(createdBacklink!.id);

    const verifiedBacklink = await prisma.backlink.findUnique({
      where: { id: createdBacklink!.id }
    });
    assertTest(verifiedBacklink?.verificationStatus === 'VERIFIED', 'Backlink verified as VERIFIED when link exists in HTML');
    assertTest(verifiedBacklink?.status === 'ACTIVE', 'Backlink status is ACTIVE');
    assertTest(verifiedBacklink?.linkAttributes.includes('NOFOLLOW'), 'Captures NOFOLLOW attribute');
    assertTest(verifiedBacklink?.anchorText === 'Autonomous SEO Guide', 'Captures anchor text from live DOM');

    // ------------------------------------------------------------------------
    // TEST 8: Live Backlink Verification - Link Missing -> MISSING
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Live Verification - Link Missing -> MISSING ---');
    const missingBacklink = await prisma.backlink.create({
      data: {
        websiteId: TEST_WEBSITE_ID,
        sourceUrl: 'https://external-blog.com/post-without-link',
        targetUrl: 'https://my-saas-platform.com/about',
        referringDomain: 'external-blog.com',
        status: 'ACTIVE'
      }
    });

    (backlinkFetcher as any).fetchSafely = async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body><p>No outbound links here.</p></body></html>',
        redirectCount: 0
      };
    };

    await verifyBacklink(missingBacklink.id);

    const checkedMissing = await prisma.backlink.findUnique({
      where: { id: missingBacklink.id }
    });
    assertTest(checkedMissing?.verificationStatus === 'MISSING', 'Backlink marked MISSING when link is absent');
    assertTest(checkedMissing?.status === 'LOST', 'Backlink status updated to LOST');

    // ------------------------------------------------------------------------
    // TEST 9: Monthly SEO Report Backlink Reporting Integrity
    // ------------------------------------------------------------------------
    console.log('\n--- Test 9: Monthly SEO Report Backlink Reporting Integrity ---');
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const report = await generateMonthlyReport(TEST_WEBSITE_ID, currentYear, currentMonth);

    const reportBacklinks = (report.reportData as any)?.backlinks;
    assertTest(reportBacklinks?.verified === 1, 'Monthly report accurately counts 1 VERIFIED backlink (not faked)');
    assertTest(reportBacklinks?.missing === 1, 'Monthly report accurately counts 1 MISSING backlink');
    assertTest(reportBacklinks?.acquired === 1, 'Acquired backlinks strictly counts verified backlinks');
    assertTest(report.backlinksAcquired === 1, 'Root backlinksAcquired field matches verified count');
    assertTest(
      (report.reportData as any)?.summary && typeof (report.reportData as any)?.summary === 'string',
      'Report summary prose generated without fabricating acquired numbers'
    );

    // ------------------------------------------------------------------------
    // TEST 10: Periodic Stale Backlink Check enqueues jobs
    // ------------------------------------------------------------------------
    console.log('\n--- Test 10: Periodic Stale Backlink Check ---');
    // Create an UNVERIFIED backlink
    const unverifiedBacklink = await prisma.backlink.create({
      data: {
        websiteId: TEST_WEBSITE_ID,
        sourceUrl: 'https://unverified-source.com/page',
        targetUrl: 'https://my-saas-platform.com',
        referringDomain: 'unverified-source.com',
        verificationStatus: 'UNVERIFIED',
        status: 'ACTIVE'
      }
    });

    const enqueued = await runStaleBacklinkEnqueue(50, 14);
    assertTest(enqueued >= 1, `Stale/unverified backlink check successfully enqueued ${enqueued} verification job(s)`);

    const enqueuedJob = await prisma.backgroundJob.findFirst({
      where: {
        type: 'BACKLINK_VERIFICATION',
        payload: { path: ['backlinkId'], equals: unverifiedBacklink.id }
      }
    });
    assertTest(!!enqueuedJob, 'Verification job exists in queue for unverified backlink');

    // Restore fetcher
    (backlinkFetcher as any).fetchSafely = fetchMock;

  } catch (err: any) {
    console.error('Unhandled test suite error:', err);
    failed++;
  } finally {
    setAiProvider(null);
    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`==================================================`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
