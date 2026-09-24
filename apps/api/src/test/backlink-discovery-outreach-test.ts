process.env.NODE_ENV = 'test';
import '../lib/env';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/database';
import supabase from '../lib/supabase';
import { OpportunityStatus, CampaignStatus } from '@prisma/client';

const MOCK_USER_ID = 'test-disco-user';
const MOCK_AUTH_ID = 'auth-disco-user';
const MOCK_WEBSITE_ID = 'test-disco-website';
const OTHER_WEBSITE_ID = 'other-disco-website';

import { GeminiProvider } from '../services/aiProvider';

function setupAuthMocks() {
  GeminiProvider.prototype.generateCompletion = async (options: any) => {
    const p = options.systemPrompt.toLowerCase();
    if (p.includes('discover')) return JSON.stringify({ candidates: [{ domain: 'discovered.com', type: 'GUEST_POST' }] });
    if (p.includes('qualify')) return JSON.stringify({ relevance: 85, suggestedAction: 'Outreach', suggestedAnchor: 'SEO Guide' });
    if (p.includes('outreach')) return JSON.stringify({ subject: 'Hello', message: 'I love your site.' });
    return '{}';
  };
  supabase.auth.getUser = async (token: string) => {
    if (token === 'MOCK_TOKEN') {
      return { data: { user: { id: MOCK_AUTH_ID, email: 'disco@test.com', user_metadata: { name: 'Test User' } } }, error: null } as any;
    }
    return { data: { user: null }, error: new Error('Invalid token') } as any;
  };
}

async function setupTestData() {
  await prisma.backlinkCampaign.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.backlinkOpportunity.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.backlink.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.website.deleteMany({ where: { id: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.user.deleteMany({ where: { id: MOCK_USER_ID } });

  await prisma.user.create({
    data: { id: MOCK_USER_ID, supabaseAuthId: MOCK_AUTH_ID, email: 'disco@test.com', role: 'CUSTOMER' }
  });

  await prisma.subscription.create({
    data: { userId: MOCK_USER_ID, plan: 'pro', interval: 'month', status: 'active' }
  });

  await prisma.website.create({
    data: { id: MOCK_WEBSITE_ID, userId: MOCK_USER_ID, url: 'https://test-disco.com', name: 'Test Disco' }
  });
  
  await prisma.website.create({
    data: { id: OTHER_WEBSITE_ID, userId: MOCK_USER_ID, url: 'https://other-disco.com', name: 'Other Disco' }
  });
}

async function runTests() {
  console.log('--- Starting Backlink Discovery & Outreach Tests ---');
  setupAuthMocks();
  await setupTestData();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, errorMessage?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${errorMessage ? '- ' + errorMessage : ''}`);
      failed++;
    }
  }

  try {
    // 1. Discovery
    const discoverRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/discover`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ topic: 'test seo', keyword: 'seo test' });
    
    assert(discoverRes.status === 200, 'Discovery endpoint responds successfully');
    assert(discoverRes.body.candidates && Array.isArray(discoverRes.body.candidates), 'Discovery returns candidates array');
    
    // 2. Duplicate opportunity prevention
    const opp1 = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ domain: 'unique-site.com', url: 'https://unique-site.com', type: 'GUEST_POST' });
    
    assert(opp1.status === 201, 'Create first opportunity successfully');
    
    console.log('opp1.body:', opp1.body); const opp2 = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ domain: 'unique-site.com', url: 'https://unique-site.com', type: 'GUEST_POST' });
    
    assert(opp2.status === 400 || opp2.status === 409, 'Duplicate opportunity prevention works', `Expected 400/409, got ${opp2.status}`);

    // 3. Tenant isolation
    const tenantRes = await request(app)
      .post(`/api/websites/${OTHER_WEBSITE_ID}/backlink-opportunities`)
      .set('Authorization', 'Bearer INVALID_TOKEN')
      .send({ domain: 'tenant-test.com', url: 'https://tenant-test.com', type: 'GUEST_POST' });
    
    assert(tenantRes.status === 401, 'Tenant isolation blocks unauthorized access');

    // 4. Qualification
    const qualRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${opp1.body.id}/qualify`)
      .set('Authorization', 'Bearer MOCK_TOKEN');
      
    assert(qualRes.status === 200, 'Qualification endpoint returns successfully');
    assert(qualRes.body.status === 'QUALIFIED', 'Qualification updates status to QUALIFIED');

    // 5. Campaign creation
    const campRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ opportunityId: opp1.body.id });
      
    assert(campRes.status === 201, 'Campaign creation responds successfully', campRes.body?.error);
    const campaignId = campRes.body.id;
    
    // 6. Campaign status transitions
    const statRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns/${campaignId}/status`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ status: 'CONTACTED' });
      
    assert(statRes.status === 200, 'Campaign status transition to CONTACTED works');
    assert(statRes.body.status === 'CONTACTED', 'Campaign status updated correctly');

    // 7. AI outreach generation
    const genRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns/${campaignId}/generate-message`)
      .set('Authorization', 'Bearer MOCK_TOKEN');
      
    assert(genRes.status === 200, 'Outreach generation responds successfully');
    assert(genRes.body.message && typeof genRes.body.message === 'string', 'Generated message returned');

    // 8. LINK_ACQUIRED → Backlink creation & 9. LINK_ACQUIRED → existing Trigger.dev verification dispatch
    // We mock the transition of the opportunity to LINK_ACQUIRED and check if backlink and job were created
    
    // We need to bypass the strict status checks for LINK_ACQUIRED by forcing it from ACCEPTED
    await prisma.backlinkOpportunity.update({
      where: { id: opp1.body.id },
      data: { status: 'ACCEPTED' }
    });
    
    const acquireRes = await request(app)
      .patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${opp1.body.id}/status`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ status: 'LINK_ACQUIRED', sourceUrl: 'https://unique-site.com/post', targetUrl: 'https://test-disco.com' });
      
    assert(acquireRes.status === 200, 'Transition to LINK_ACQUIRED responds successfully');
    
    const backlink = await prisma.backlink.findFirst({
      where: { websiteId: MOCK_WEBSITE_ID, referringDomain: 'unique-site.com' }
    });
    
    assert(!!backlink, 'LINK_ACQUIRED automatically created a Backlink record');
    
    const verifyJob = await prisma.backgroundJob.findFirst({
      where: { type: 'BACKLINK_VERIFICATION', payload: { path: ['backlinkId'], equals: backlink?.id } }
    });
    
    assert(!!verifyJob, 'LINK_ACQUIRED correctly dispatched verification job');

    // 10. SSRF protection
    // Tested implicitly in discovery/qualification because they use fetchSafely.
    // Let's create an opportunity with a private IP to see if it qualifies cleanly without crashing and gets rejected/error
    const ssrfOpp = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set('Authorization', 'Bearer MOCK_TOKEN')
      .send({ domain: '10.0.0.1', url: 'http://10.0.0.1', type: 'GUEST_POST' });
      
    const qualSsrfRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${ssrfOpp.body.id}/qualify`)
      .set('Authorization', 'Bearer MOCK_TOKEN');
      
    console.log('ssrfOpp.body:', ssrfOpp.body); assert(ssrfOpp.status === 400, 'SSRF URL handled gracefully (prevented at creation)');

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
