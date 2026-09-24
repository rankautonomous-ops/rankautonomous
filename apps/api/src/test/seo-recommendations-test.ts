process.env.NODE_ENV = 'test';
import '../lib/env';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import supabase from '../lib/supabase';
import * as http from 'http';

const prisma = new PrismaClient();
const PORT = 4006;

let server: http.Server;
let MOCK_USER_ID = 'test-rec-user';
let MOCK_AUTH_ID = 'auth-rec-user';
let MOCK_WEBSITE_ID = 'test-rec-website';

function setupAuthMocks() {
  supabase.auth.getUser = async (token: string) => {
    if (token === 'MOCK_TOKEN') {
      return { data: { user: { id: MOCK_AUTH_ID, email: 'rec-test@example.com', user_metadata: { name: 'Test User' } } }, error: null } as any;
    }
    return { data: { user: null }, error: new Error('Invalid token') } as any;
  };
}

async function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(PORT, () => resolve());
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, errorMessage?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      let msg = errorMessage;
      if (typeof msg === 'object') msg = JSON.stringify(msg);
      console.error(`❌ FAIL: ${testName} ${msg ? '- ' + msg : ''}`);
      failed++;
    }
  }

  try {
    console.log('--- Starting SEO Recommendations Tests ---');

    setupAuthMocks();
    await startServer();

    // 1. Setup Data
    await prisma.seoRecommendation.deleteMany({ where: { websiteId: MOCK_WEBSITE_ID } });
    await prisma.website.deleteMany({ where: { id: MOCK_WEBSITE_ID } });
    await prisma.user.deleteMany({ where: { id: MOCK_USER_ID } });

    await prisma.user.create({
      data: {
        id: MOCK_USER_ID,
        email: 'rec-test@example.com',
        role: 'CUSTOMER',
        supabaseAuthId: MOCK_AUTH_ID
      },
    });

    await prisma.subscription.create({
      data: {
        userId: MOCK_USER_ID,
        stripeCustomerId: 'cus_rec',
        plan: 'pro',
        interval: 'month',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.website.create({
      data: {
        id: MOCK_WEBSITE_ID,
        userId: MOCK_USER_ID,
        url: 'https://rec-test.com',
        name: 'Rec Test',
      },
    });

    // Create a keyword opportunity
    await prisma.keyword.create({
      data: {
        websiteId: MOCK_WEBSITE_ID,
        keyword: 'technical seo guide',
        normalizedKeyword: 'technical seo guide',
        intent: 'INFORMATIONAL',
        searchVolume: 1000,
        difficulty: 30,
      }
    });

    // 2. Generate Recommendations
    const genRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/recommendations/generate`)
      .set('Authorization', 'Bearer MOCK_TOKEN');

    assert(genRes.status === 200, 'Recommendation generation endpoint responds 200', genRes.body);
    assert(genRes.body.success === true, 'Recommendation generation returns success');
    assert(genRes.body.data.length > 0, 'Recommendation generation created candidates');
    
    // We expect 1 recommendation for the keyword
    const keywordRec = genRes.body.data.find((r: any) => r.category === 'KEYWORD');
    assert(keywordRec !== undefined, 'Keyword recommendation was generated');
    assert(keywordRec?.priority === 'MEDIUM' || keywordRec?.priority === 'HIGH' || keywordRec?.priority === 'CRITICAL', 'Keyword recommendation has valid priority');

    // 3. Get Recommendations
    const getRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/recommendations`)
      .set('Authorization', 'Bearer MOCK_TOKEN');

    assert(getRes.status === 200, 'Get recommendations responds 200', getRes.body);
    assert(Array.isArray(getRes.body), 'Get recommendations returns array');

    // 4. Update Recommendation
    if (keywordRec) {
      const patchRes = await request(app)
        .patch(`/api/websites/${MOCK_WEBSITE_ID}/recommendations/${keywordRec.id}`)
        .set('Authorization', 'Bearer MOCK_TOKEN')
        .send({ status: 'SNOOZED' });
        
      assert(patchRes.status === 200, 'Patch recommendation responds 200', patchRes.body);
      assert(patchRes.body.status === 'SNOOZED', 'Recommendation status was updated');
    }

    // 5. Execute Recommendation
    if (keywordRec) {
      const execRes = await request(app)
        .post(`/api/websites/${MOCK_WEBSITE_ID}/recommendations/${keywordRec.id}/execute`)
        .set('Authorization', 'Bearer MOCK_TOKEN');
        
      assert(execRes.status === 200, 'Execute recommendation responds 200', execRes.body);
      
      const article = await prisma.article.findFirst({ where: { primaryKeyword: 'technical seo guide' } });
      assert(article !== null, 'Execution successfully created an article draft');
    }

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    await stopServer();
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
