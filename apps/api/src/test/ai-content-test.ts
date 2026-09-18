process.env.NODE_ENV = 'test';

import { strict as assert } from 'assert';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/database';
import { setAiProvider, IAiProvider, AiCompletionOptions } from '../services/aiProvider';
import { generateArticle, reviewArticle } from '../services/aiContent';
import supabase from '../lib/supabase';

const MOCK_USER_ID = 'test-content-user';
const MOCK_AUTH_ID = 'auth-content-user';
const MOCK_WEBSITE_ID = 'test-content-website';

const OTHER_USER_ID = 'other-content-user';
const OTHER_AUTH_ID = 'other-auth-id';
const OTHER_WEBSITE_ID = 'other-content-website';

class MockAiProvider implements IAiProvider {
  async generateCompletion(opts: AiCompletionOptions): Promise<string> {
    const prompt = opts.systemPrompt + opts.userPrompt;

    if (prompt.includes('Content Reviewer')) {
      if (prompt.includes('FAIL_REVIEW')) {
        return '{"invalid": "json"}';
      }
      return JSON.stringify({
        score: 95,
        summary: "Excellent test article.",
        strengths: ["Strong keyword alignment", "Clear heading hierarchy"],
        issues: ["Meta description could be punchier"],
        recommendations: ["Ship it"]
      });
    }

    if (prompt.includes('FAIL_GENERATION')) {
      return '{ bad json }';
    }

    if (prompt.includes('MALFORMED_JSON')) {
      return JSON.stringify({
        title: "Just a title" // Missing content
      });
    }

    if (prompt.includes('OVERSIZED_CONTENT')) {
      return JSON.stringify({
        title: "Oversized Article",
        metaDescription: "Meta Description",
        slug: "oversized-article",
        headings: ["H2: Overview"],
        content: "<p>" + "A".repeat(60000) + "</p>",
        internalLinks: ["https://example.com/valid"],
        imageSuggestions: ["Infographic"],
        cta: "Sign up"
      });
    }

    if (prompt.includes('INVENTED_LINKS')) {
      return JSON.stringify({
        title: "Link Filtering Article",
        metaDescription: "Testing invented links",
        slug: "link-filtering",
        headings: ["H2: Links"],
        content: "<p>Content with invented URLs</p>",
        internalLinks: ["https://example.com/valid", "https://example.com/hallucinated-non-existent-page"],
        imageSuggestions: ["Banner"],
        cta: "Learn more"
      });
    }

    return JSON.stringify({
      title: "Test Article Title",
      metaDescription: "Test Meta Description for Search Engines",
      slug: "test-article-title",
      headings: ["H2: Overview", "H3: Key Benefits"],
      content: "<p>Comprehensive guide to SEO content automation.</p>",
      internalLinks: ["https://example.com/valid"],
      imageSuggestions: ["Diagram of AI content lifecycle"],
      cta: "Try RankAutonomous today"
    });
  }
}

async function setupTestData() {
  await prisma.aiJob.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
  await prisma.article.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.pageResult.deleteMany({ where: { crawlJob: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } } });
  await prisma.crawlJob.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.website.deleteMany({ where: { id: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
  await prisma.user.deleteMany({ where: { id: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });

  await prisma.user.create({
    data: { id: MOCK_USER_ID, supabaseAuthId: MOCK_AUTH_ID, email: 'content@test.com', role: 'CUSTOMER' }
  });

  await prisma.user.create({
    data: { id: OTHER_USER_ID, supabaseAuthId: OTHER_AUTH_ID, email: 'other@test.com', role: 'CUSTOMER' }
  });

  await prisma.subscription.create({
    data: { userId: MOCK_USER_ID, status: 'active', plan: 'pro', interval: 'month' }
  });

  await prisma.subscription.create({
    data: { userId: OTHER_USER_ID, status: 'active', plan: 'pro', interval: 'month' }
  });

  await prisma.website.create({
    data: { id: MOCK_WEBSITE_ID, userId: MOCK_USER_ID, url: 'https://example.com', name: 'Example Site' }
  });

  await prisma.website.create({
    data: { id: OTHER_WEBSITE_ID, userId: OTHER_USER_ID, url: 'https://other.com', name: 'Other Site' }
  });

  // Create a successful crawl and page in DB for MOCK_WEBSITE_ID to test internal linking validation
  const crawl = await prisma.crawlJob.create({
    data: { websiteId: MOCK_WEBSITE_ID, status: 'COMPLETED' }
  });
  await prisma.pageResult.create({
    data: { crawlJobId: crawl.id, url: 'https://example.com/valid', status: 'SUCCESS', title: 'Valid Existing Page' }
  });

  // Mock Supabase Auth
  supabase.auth.getUser = async (token: string) => {
    if (token === 'MOCK_TOKEN') {
      return { data: { user: { id: MOCK_AUTH_ID, email: 'content@test.com', user_metadata: { name: 'Test Content User' } } }, error: null } as any;
    }
    if (token === 'OTHER_TOKEN') {
      return { data: { user: { id: OTHER_AUTH_ID, email: 'other@test.com', user_metadata: { name: 'Other User' } } }, error: null } as any;
    }
    return { data: { user: null }, error: new Error('Invalid token') } as any;
  };
}

const mockAuthHeaders = {
  'Authorization': 'Bearer MOCK_TOKEN',
  'X-Mock-User-Id': MOCK_AUTH_ID,
  'X-Mock-Role': 'CUSTOMER'
};

const otherAuthHeaders = {
  'Authorization': 'Bearer OTHER_TOKEN',
  'X-Mock-User-Id': OTHER_AUTH_ID,
  'X-Mock-Role': 'CUSTOMER'
};

async function runAll25Tests() {
  console.log('==================================================');
  console.log('RUNNING STEP 6G AI CONTENT ENGINE & WORKFLOW TESTS');
  console.log('==================================================');

  setAiProvider(new MockAiProvider());
  await setupTestData();

  let articleId: string;
  let article2Id: string;
  let testGenJobId: string;

  try {
    // 1. Article Creation
    const createRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles`)
      .set(mockAuthHeaders)
      .send({
        topic: 'AI Content Strategy',
        primaryKeyword: 'ai seo content',
        wordCount: 1200,
        tone: 'Authoritative',
        language: 'English',
        targetAudience: 'Marketers',
        targetLocation: 'United States',
        callToAction: 'Book a demo'
      });
    assert.equal(createRes.status, 201, 'Should create article with 201 status');
    assert.equal(createRes.body.status, 'IDEA', 'Initial status should be IDEA');
    articleId = createRes.body.id;
    console.log('PASS: 1. Article creation');

    // 2. Article Retrieval
    const getRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}`)
      .set(mockAuthHeaders);
    assert.equal(getRes.status, 200, 'Should get article');
    assert.equal(getRes.body.topic, 'AI Content Strategy');
    assert.equal(getRes.body.primaryKeyword, 'ai seo content');
    console.log('PASS: 2. Article retrieval');

    // 3. Article Update
    const updateRes = await request(app)
      .put(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}`)
      .set(mockAuthHeaders)
      .send({
        targetAudience: 'Enterprise Marketing Directors',
        callToAction: 'Start Free Trial'
      });
    assert.equal(updateRes.status, 200, 'Should update article');
    assert.equal(updateRes.body.targetAudience, 'Enterprise Marketing Directors');
    assert.equal(updateRes.body.callToAction, 'Start Free Trial');
    console.log('PASS: 3. Article update');

    // 4. Article Deletion (tested with a temporary article)
    const tempArtRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles`)
      .set(mockAuthHeaders)
      .send({ topic: 'Temporary Article' });
    const tempId = tempArtRes.body.id;
    const delRes = await request(app)
      .delete(`/api/websites/${MOCK_WEBSITE_ID}/articles/${tempId}`)
      .set(mockAuthHeaders);
    assert.equal(delRes.status, 200, 'Should delete article');
    const verifyDel = await prisma.article.findUnique({ where: { id: tempId } });
    assert.equal(verifyDel, null, 'Deleted article should not exist');
    console.log('PASS: 4. Article deletion');

    // 5. Tenant Isolation
    const crossTenantRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/articles`)
      .set(otherAuthHeaders);
    assert.equal(crossTenantRes.status, 404, 'Cross-tenant access must be rejected with 404');
    console.log('PASS: 5. Tenant isolation');

    // 6. Unauthorized Access
    const unauthRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/articles`);
    assert.equal(unauthRes.status, 401, 'Unauthenticated request must be rejected with 401');
    console.log('PASS: 6. Unauthorized access');

    // 7. Invalid Configuration
    const badConfigRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles`)
      .set(mockAuthHeaders)
      .send({ wordCount: 50 }); // Less than minimum 100
    assert.equal(badConfigRes.status, 400, 'Word count below 100 must be rejected with 400');
    console.log('PASS: 7. Invalid configuration');

    // 8. Valid Configuration
    const validConfigRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles`)
      .set(mockAuthHeaders)
      .send({
        topic: 'Valid Configuration Topic',
        primaryKeyword: 'rankings guide',
        wordCount: 1500,
        tone: 'Conversational'
      });
    assert.equal(validConfigRes.status, 201, 'Valid configuration must be accepted with 201');
    article2Id = validConfigRes.body.id;
    console.log('PASS: 8. Valid configuration');

    // 9. Generation Request
    const genReqRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}/generate`)
      .set(mockAuthHeaders);
    assert.equal(genReqRes.status, 202, 'Generation request must return 202 Accepted');
    assert.ok(genReqRes.body.jobId, 'Should return jobId');
    assert.equal(genReqRes.body.status, 'QUEUED', 'Status should be QUEUED');
    testGenJobId = genReqRes.body.jobId;
    console.log('PASS: 9. Generation request');

    // 10. Generation Status
    const genStatusRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}`)
      .set(mockAuthHeaders);
    assert.equal(genStatusRes.status, 200);
    assert.ok(genStatusRes.body.latestJob, 'Article should include latestJob info');
    assert.ok(['QUEUED', 'PROCESSING', 'COMPLETED'].includes(genStatusRes.body.latestJob.status));
    console.log('PASS: 10. Generation status');

    // 11. Successful AI Generation
    await generateArticle(testGenJobId);
    const postGenArticle = await prisma.article.findUnique({ where: { id: articleId } });
    assert.equal(postGenArticle?.status, 'DRAFT', 'Article status should be DRAFT after generation');
    assert.equal(postGenArticle?.title, 'Test Article Title');
    assert.ok(postGenArticle?.content?.includes('Comprehensive guide'), 'Content should be populated');
    assert.ok(postGenArticle?.wordCount && postGenArticle.wordCount > 0, 'Word count should be computed');
    console.log('PASS: 11. Successful AI generation');

    // 12. Malformed AI JSON
    await prisma.article.update({ where: { id: article2Id }, data: { topic: 'FAIL_GENERATION' } });
    const malformedJob = await prisma.aiJob.create({
      data: { userId: MOCK_USER_ID, websiteId: MOCK_WEBSITE_ID, type: 'GENERATE_ARTICLE', payload: { articleId: article2Id } }
    });
    await generateArticle(malformedJob.id);
    const malformedJobResult = await prisma.aiJob.findUnique({ where: { id: malformedJob.id } });
    assert.equal(malformedJobResult?.status, 'FAILED');
    assert.ok(malformedJobResult?.error?.includes('AI returned invalid JSON'));
    console.log('PASS: 12. Malformed AI JSON');

    // 13. Missing Required AI Fields
    await prisma.article.update({ where: { id: article2Id }, data: { topic: 'MALFORMED_JSON' } });
    const missingFieldJob = await prisma.aiJob.create({
      data: { userId: MOCK_USER_ID, websiteId: MOCK_WEBSITE_ID, type: 'GENERATE_ARTICLE', payload: { articleId: article2Id } }
    });
    await generateArticle(missingFieldJob.id);
    const missingResult = await prisma.aiJob.findUnique({ where: { id: missingFieldJob.id } });
    assert.equal(missingResult?.status, 'FAILED');
    assert.ok(missingResult?.error?.includes('Missing content in AI output'));
    console.log('PASS: 13. Missing required AI fields');

    // 14. Oversized AI Output Bounding
    await prisma.article.update({ where: { id: article2Id }, data: { topic: 'OVERSIZED_CONTENT' } });
    const oversizedJob = await prisma.aiJob.create({
      data: { userId: MOCK_USER_ID, websiteId: MOCK_WEBSITE_ID, type: 'GENERATE_ARTICLE', payload: { articleId: article2Id } }
    });
    await generateArticle(oversizedJob.id);
    const oversizedArticle = await prisma.article.findUnique({ where: { id: article2Id } });
    assert.ok(oversizedArticle?.content && oversizedArticle.content.length <= 50000, 'Content must be bounded to 50k chars');
    console.log('PASS: 14. Oversized AI output');

    // 15. Internal-Link Validation
    assert.deepEqual(postGenArticle?.internalLinks, ['https://example.com/valid'], 'Valid crawled links must be preserved');
    console.log('PASS: 15. Internal-link validation');

    // 16. Invented Internal URL Rejection
    await prisma.article.update({ where: { id: article2Id }, data: { topic: 'INVENTED_LINKS' } });
    const inventedLinkJob = await prisma.aiJob.create({
      data: { userId: MOCK_USER_ID, websiteId: MOCK_WEBSITE_ID, type: 'GENERATE_ARTICLE', payload: { articleId: article2Id } }
    });
    await generateArticle(inventedLinkJob.id);
    const filteredArticle = await prisma.article.findUnique({ where: { id: article2Id } });
    assert.deepEqual(filteredArticle?.internalLinks, ['https://example.com/valid'], 'Invented URLs must be stripped');
    console.log('PASS: 16. Invented internal URL rejection');

    // 17. External-Reference Safety
    // Verify that articles do not persist fabricated citations
    assert.equal(filteredArticle?.externalReferences, null, 'External references not fabricated as verified');
    console.log('PASS: 17. External-reference safety');

    // 18. AI Review Success
    const reviewReqRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}/review`)
      .set(mockAuthHeaders);
    assert.equal(reviewReqRes.status, 202, 'AI Review request returns 202');
    await reviewArticle(reviewReqRes.body.jobId);
    const reviewedArticle = await prisma.article.findUnique({ where: { id: articleId } });
    assert.equal(reviewedArticle?.status, 'USER_REVIEW', 'Review transitions article to USER_REVIEW');
    const reviewData: any = reviewedArticle?.aiReviewData;
    assert.equal(reviewData.score, 95);
    assert.ok(reviewData.strengths.length > 0);
    console.log('PASS: 18. AI review success');

    // 19. AI Review Failure
    await prisma.article.update({ where: { id: article2Id }, data: { topic: 'FAIL_REVIEW', content: '<p>Some content</p>' } });
    const badReviewJob = await prisma.aiJob.create({
      data: { userId: MOCK_USER_ID, websiteId: MOCK_WEBSITE_ID, type: 'REVIEW_ARTICLE', payload: { articleId: article2Id } }
    });
    await reviewArticle(badReviewJob.id);
    const badReviewJobResult = await prisma.aiJob.findUnique({ where: { id: badReviewJob.id } });
    assert.equal(badReviewJobResult?.status, 'FAILED');
    console.log('PASS: 19. AI review failure');

    // 20. Invalid Workflow Transition
    const invalidTransRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${article2Id}/transition`)
      .set(mockAuthHeaders)
      .send({ targetStatus: 'PUBLISHED' }); // Status is DRAFT, cannot jump straight to PUBLISHED
    assert.equal(invalidTransRes.status, 400, 'Invalid transition from DRAFT to PUBLISHED must return 400');
    console.log('PASS: 20. Invalid workflow transition');

    // 21. Valid Workflow Transition
    // articleId is currently USER_REVIEW. Allowed transitions: APPROVED or DRAFT.
    const validTransRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}/transition`)
      .set(mockAuthHeaders)
      .send({ targetStatus: 'APPROVED' });
    assert.equal(validTransRes.status, 200, 'Valid transition to APPROVED returns 200');
    assert.equal(validTransRes.body.status, 'APPROVED');
    console.log('PASS: 21. Valid workflow transition');

    // 22. Duplicate Generation Prevention
    // Reset status to DRAFT and create an in-flight job
    const inFlightJob = await prisma.aiJob.create({
      data: { userId: MOCK_USER_ID, websiteId: MOCK_WEBSITE_ID, type: 'GENERATE_ARTICLE', status: 'PROCESSING', payload: { articleId } }
    });
    await prisma.article.update({ where: { id: articleId }, data: { generationJobId: inFlightJob.id } });
    const dupRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}/generate`)
      .set(mockAuthHeaders);
    assert.equal(dupRes.status, 409, 'Duplicate generation request must be rejected with 409 Conflict');
    console.log('PASS: 22. Duplicate generation prevention');

    // 23. Failed Generation Persistence
    assert.equal(malformedJobResult?.status, 'FAILED');
    assert.ok(malformedJobResult?.error && malformedJobResult.error.length > 0, 'Error info is persisted');
    console.log('PASS: 23. Failed generation persistence');

    // 24. Retry Behavior
    // After marking job FAILED, requesting generation again should succeed with 202
    await prisma.aiJob.update({ where: { id: inFlightJob.id }, data: { status: 'FAILED' } });
    const retryRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}/generate`)
      .set(mockAuthHeaders);
    assert.equal(retryRes.status, 202, 'Retry generation request succeeds after previous failure');
    if (retryRes.body?.jobId) {
      await generateArticle(retryRes.body.jobId);
    }
    console.log('PASS: 24. Retry behavior');

    // 25. Published-State Behavior
    // Transition article to APPROVED, then to PUBLISHED
    await prisma.article.update({ where: { id: articleId }, data: { status: 'APPROVED' } });
    const pubRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}/transition`)
      .set(mockAuthHeaders)
      .send({ targetStatus: 'PUBLISHED' });
    assert.equal(pubRes.status, 200, 'Transition from APPROVED to PUBLISHED succeeds');
    assert.equal(pubRes.body.status, 'PUBLISHED');

    // Attempting an invalid jump from PUBLISHED must be rejected
    const badPubTrans = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles/${articleId}/transition`)
      .set(mockAuthHeaders)
      .send({ targetStatus: 'DRAFT' });
    assert.equal(badPubTrans.status, 400, 'Invalid transition out of PUBLISHED must be rejected');
    console.log('PASS: 25. Published-state behavior');

    console.log('==================================================');
    console.log('SUMMARY: 25 Passed, 0 Failed');
    console.log('==================================================');
  } finally {
    // Teardown test data
    await prisma.aiJob.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
    await prisma.article.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
    await prisma.pageResult.deleteMany({ where: { crawlJob: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } } });
    await prisma.crawlJob.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
    await prisma.website.deleteMany({ where: { id: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
    setAiProvider(null);
  }
}

runAll25Tests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('AI Content Test Suite Failed:', err);
    process.exit(1);
  });
