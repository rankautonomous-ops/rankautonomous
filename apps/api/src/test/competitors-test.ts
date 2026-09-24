process.env.NODE_ENV = 'test';

import { strict as assert } from 'assert';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/database';
import { getAiProvider, setAiProvider, IAiProvider } from '../services/aiProvider';
import { extractDomain, normalizeCompetitorUrl } from '../services/competitors/competitorService';
import { CompetitorStatus, KeywordSource } from '@prisma/client';
import supabase from '../lib/supabase';

const MOCK_USER_ID = 'test-comp-user';
const MOCK_AUTH_ID = 'auth-comp-user';
const MOCK_WEBSITE_ID = 'test-comp-website';

const OTHER_USER_ID = 'other-comp-user';
const OTHER_AUTH_ID = 'other-auth-id';
const OTHER_WEBSITE_ID = 'other-comp-website';

class MockAiProvider implements IAiProvider {
  async generateCompletion(options: any): Promise<string> {
    if (options.systemPrompt.includes('Suggest 3-5 REAL competitor domains')) {
      return JSON.stringify({
        suggestions: [
          { domain: 'example.com', url: 'https://example.com', reason: 'Mock reason' }
        ]
      });
    }
    
    if (options.systemPrompt.includes('analyze a competitor website')) {
      return JSON.stringify({
        positioning: "Mock positioning",
        strengths: ["Mock strength"],
        weaknesses: ["Mock weakness"],
        contentThemes: ["Mock theme"],
        keywordOpportunities: [
          {
            keyword: "mock keyword",
            intent: "INFORMATIONAL",
            reason: "Mock reason",
            relevance: 8,
            opportunityDescription: "Mock description"
          }
        ],
        contentGaps: [
          {
            topic: "Mock topic",
            suggestedTitle: "Mock title",
            reason: "Mock reason",
            targetIntent: "INFORMATIONAL",
            suggestedOutline: ["Mock outline 1", "Mock outline 2"]
          }
        ]
      });
    }

    return '{}';
  }
}



async function setupTestData() {
  await prisma.competitor.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.article.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.keyword.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.website.deleteMany({ where: { id: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
  await prisma.user.deleteMany({ where: { id: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });

  await prisma.user.create({
    data: { id: MOCK_USER_ID, supabaseAuthId: MOCK_AUTH_ID, email: 'comp@test.com', role: 'CUSTOMER' }
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

  supabase.auth.getUser = async (token: string) => {
    if (token === 'MOCK_TOKEN') {
      return { data: { user: { id: MOCK_AUTH_ID, email: 'comp@test.com', user_metadata: { name: 'Test User' } } }, error: null } as any;
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

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING COMPETITOR TESTS');
  console.log('==================================================');

  setAiProvider(new MockAiProvider());
  await setupTestData();

  let compId: string;

  try {
    // 7. URL validation
    assert.equal(normalizeCompetitorUrl('example.com'), 'https://example.com');
    assert.equal(normalizeCompetitorUrl('http://example.com/'), 'http://example.com');
    assert.equal(extractDomain('https://example.com'), 'example.com');
    console.log('PASS: 7. URL validation');

    // 8. SSRF protection
    const fetchResult = await require('../services/backlinks/backlinkFetcher').fetchSafely('http://localhost:3000');
    assert.equal(fetchResult.success, false);
    assert.equal(fetchResult.errorCode, 'SSRF_BLOCKED');
    console.log('PASS: 8. SSRF protection');

    // 1. List competitors (empty)
    const listRes1 = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/competitors`).set(mockAuthHeaders);
    assert.equal(listRes1.status, 200);
    assert.deepEqual(listRes1.body.data, []);
    console.log('PASS: 1. List competitors (empty)');

    // 5. Unauthorized access
    const unauthRes = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/competitors`);
    assert.equal(unauthRes.status, 401);
    console.log('PASS: 5. Unauthorized access rejected');

    // 6. Cross-tenant access
    const crossRes = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/competitors`).set(otherAuthHeaders);
    assert.equal(crossRes.status, 404);
    console.log('PASS: 6. Cross-tenant access rejected');

    // 2. Add competitor
    const addRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors`)
      .set(mockAuthHeaders)
      .send({ url: 'https://example.com' });
    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.domain, 'example.com');
    compId = addRes.body.id;
    console.log('PASS: 2. Add competitor');

    // 3. Duplicate competitor
    const dupRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors`)
      .set(mockAuthHeaders)
      .send({ url: 'https://example.com' });
    assert.equal(dupRes.status, 409);
    console.log('PASS: 3. Duplicate competitor rejected');

    // 10. AI suggestion
    const suggRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors/suggest`)
      .set(mockAuthHeaders);
    assert.equal(suggRes.status, 200);
    assert.equal(suggRes.body.data[0].domain, 'example.com');
    console.log('PASS: 10. AI suggestion response validation');

    // 9 & 11. Competitor analysis persistence
    const analyzeRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors/${compId}/analyze`)
      .set(mockAuthHeaders);
    assert.equal(analyzeRes.status, 200);
    assert.equal(analyzeRes.body.data.positioning, 'Mock positioning');
    
    const dbComp = await prisma.competitor.findUnique({ where: { id: compId } });
    assert.equal(dbComp?.status, 'ANALYZED');
    console.log('PASS: 11. Competitor analysis persistence');

    // 13 & 14. Keyword promotion & duplicate handling
    const kwRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors/${compId}/add-keyword`)
      .set(mockAuthHeaders)
      .send({ keyword: 'mock keyword', intent: 'INFORMATIONAL' });
    assert.equal(kwRes.status, 200);
    assert.equal(kwRes.body.data.keyword, 'mock keyword');
    
    const kwDup = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors/${compId}/add-keyword`)
      .set(mockAuthHeaders)
      .send({ keyword: 'mock keyword', intent: 'INFORMATIONAL' });
    assert.equal(kwDup.status, 200);
    console.log('PASS: 13 & 14. Keyword promotion and duplication');

    // 15. Content gap action
    const artRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/articles`)
      .set(mockAuthHeaders)
      .send({ topic: 'Mock topic', primaryKeyword: 'Mock title', wordCount: 1500 });
    assert.equal(artRes.status, 201);
    assert.equal(artRes.body.topic, 'Mock topic');
    console.log('PASS: 15. Content gap action creates article');

    // 12. Analysis error handling
    const addBad = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors`)
      .set(mockAuthHeaders)
      .send({ url: 'https://this-will-definitely-fail.xyz123' });
    const badId = addBad.body.id;
    const analyzeBad = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/competitors/${badId}/analyze`)
      .set(mockAuthHeaders);
    assert.equal(analyzeBad.status, 500);
    const dbBad = await prisma.competitor.findUnique({ where: { id: badId } });
    assert.equal(dbBad?.status, 'ERROR');
    console.log('PASS: 12. Analysis error handling');

    // 4. Delete competitor
    const delRes = await request(app)
      .delete(`/api/websites/${MOCK_WEBSITE_ID}/competitors/${compId}`)
      .set(mockAuthHeaders);
    assert.equal(delRes.status, 204);
    const checkDel = await prisma.competitor.findUnique({ where: { id: compId } });
    assert.equal(checkDel, null);
    console.log('PASS: 4. Delete competitor');

    console.log('==================================================');
    console.log('SUMMARY: 15 Passed, 0 Failed');
    console.log('==================================================');

  } finally {
    await prisma.competitor.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
    await prisma.article.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
    await prisma.keyword.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
    await prisma.website.deleteMany({ where: { id: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
    setAiProvider(null);
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Competitors Test Suite Failed:', err);
    process.exit(1);
  });
