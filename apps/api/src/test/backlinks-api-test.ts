process.env.NODE_ENV = 'test';
import '../lib/env';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/database';
import supabase from '../lib/supabase';
import { OpportunityStatus } from '@prisma/client';
import { setAiProvider } from '../services/aiProvider';

const MOCK_USER_ID = 'test-backlink-user';
const MOCK_AUTH_ID = 'auth-backlink-user';
const MOCK_WEBSITE_ID = 'test-backlink-website';

const OTHER_USER_ID = 'other-backlink-user';
const OTHER_AUTH_ID = 'other-auth-backlink';
const OTHER_WEBSITE_ID = 'other-backlink-website';

function setupAuthMocks() {
  supabase.auth.getUser = async (token: string) => {
    if (token === 'MOCK_TOKEN') {
      return { data: { user: { id: MOCK_AUTH_ID, email: 'backlink@test.com', user_metadata: { name: 'Test User' } } }, error: null } as any;
    }
    if (token === 'OTHER_TOKEN') {
      return { data: { user: { id: OTHER_AUTH_ID, email: 'otherbacklink@test.com', user_metadata: { name: 'Other User' } } }, error: null } as any;
    }
    return { data: { user: null }, error: new Error('Invalid token') } as any;
  };
}

const mockAuthHeaders = {
  'Authorization': 'Bearer MOCK_TOKEN'
};

const otherAuthHeaders = {
  'Authorization': 'Bearer OTHER_TOKEN'
};

async function setupTestData() {
  await prisma.backlinkCampaign.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.backlinkOpportunity.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.backlink.deleteMany({ where: { websiteId: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.website.deleteMany({ where: { id: { in: [MOCK_WEBSITE_ID, OTHER_WEBSITE_ID] } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });
  await prisma.user.deleteMany({ where: { id: { in: [MOCK_USER_ID, OTHER_USER_ID] } } });

  await prisma.user.create({
    data: { id: MOCK_USER_ID, supabaseAuthId: MOCK_AUTH_ID, email: 'backlink@test.com', role: 'CUSTOMER' }
  });

  await prisma.user.create({
    data: { id: OTHER_USER_ID, supabaseAuthId: OTHER_AUTH_ID, email: 'otherbacklink@test.com', role: 'CUSTOMER' }
  });

  await prisma.subscription.create({
    data: { userId: MOCK_USER_ID, plan: 'pro', interval: 'month', status: 'active' }
  });

  await prisma.subscription.create({
    data: { userId: OTHER_USER_ID, plan: 'pro', interval: 'month', status: 'active' }
  });

  await prisma.website.create({
    data: { id: MOCK_WEBSITE_ID, userId: MOCK_USER_ID, url: 'https://mock.com', name: 'Mock' }
  });

  await prisma.website.create({
    data: { id: OTHER_WEBSITE_ID, userId: OTHER_USER_ID, url: 'https://other.com', name: 'Other' }
  });
}

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING STEP 12B BACKLINK CRUD API TESTS');
  console.log('==================================================');

  setupAuthMocks();
  await setupTestData();

  setAiProvider({
    generateCompletion: async () => JSON.stringify({
      candidates: [
        { url: 'https://discovered.com/post', domain: 'discovered.com', relevance: 85, reason: 'Great fit', type: 'GUEST_POST', valid: true }
      ],
      subject: 'Partnership Opportunity',
      message: 'Hello, would love to connect and partner.'
    })
  });

  let passed = 0;
  let failed = 0;
  let oppId: string;
  let backlinkId: string;
  let otherOppId: string;
  let otherBacklinkId: string;

  function assert(condition: any, message: string, res?: any) {
    if (condition) {
      console.log(`PASS: ${message}`);
      passed++;
    } else {
      console.error(`FAIL: ${message}`);
      if (res && res.body) console.error('Response body:', res.body);
      if (res && res.status) console.error('Response status:', res.status);
      failed++;
    }
  }

  try {
    // 1. Unauthenticated requests rejected across all backlink routes
    const unauthOppGet = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`);
    assert(unauthOppGet.status === 401, 'Test 1a: Unauthenticated GET opportunities rejected (401)');

    const unauthOppPost = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`).send({ domain: 'test.com', type: 'GUEST_POST' });
    assert(unauthOppPost.status === 401, 'Test 1b: Unauthenticated POST opportunities rejected (401)');

    const emptyTokenRes = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`).set({ 'Authorization': 'Bearer ' });
    assert(emptyTokenRes.status === 401, 'Test 1c: Empty Bearer token rejected (401)');

    const unauthBlGet = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks`);
    assert(unauthBlGet.status === 401, 'Test 1d: Unauthenticated GET backlinks rejected (401)');

    const unauthBlPost = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks`).send({ sourceUrl: 'https://test.com', targetUrl: 'https://mock.com', referringDomain: 'test.com' });
    assert(unauthBlPost.status === 401, 'Test 1e: Unauthenticated POST backlinks rejected (401)');

    const unauthDisc = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/discover`).send({ topic: 'tech' });
    assert(unauthDisc.status === 401, 'Test 1f: Unauthenticated POST discover rejected (401)');

    const unauthCampGet = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns`);
    assert(unauthCampGet.status === 401, 'Test 1g: Unauthenticated GET campaigns rejected (401)');

    const unauthCampPost = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns`).send({ opportunityId: 'some-id' });
    assert(unauthCampPost.status === 401, 'Test 1h: Unauthenticated POST campaigns rejected (401)');

    const unauthJobPoll = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/fake-id/verification-job`);
    assert(unauthJobPoll.status === 401, 'Test 1i: Unauthenticated GET verification-job rejected (401)');

    // 2. Setup other's opportunities for isolation test
    const otherOppRes = await request(app)
      .post(`/api/websites/${OTHER_WEBSITE_ID}/backlink-opportunities`)
      .set(otherAuthHeaders)
      .send({ domain: 'other-domain.com', type: 'GUEST_POST' });
    otherOppId = otherOppRes.body.id;

    const otherBlRes = await request(app)
      .post(`/api/websites/${OTHER_WEBSITE_ID}/backlinks`)
      .set(otherAuthHeaders)
      .send({ sourceUrl: 'https://other-domain.com/blog', targetUrl: 'https://other.com', referringDomain: 'other-domain.com' });
    otherBacklinkId = otherBlRes.body.id;

    // 3. Create opportunity (Authenticated)
    const createOppRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set(mockAuthHeaders)
      .send({
        domain: 'example.com',
        url: 'example.com/post',
        type: 'RESOURCE_PAGE',
        relevance: 90,
        domainAuthority: 50,
      });
    
    assert(createOppRes.status === 201 && createOppRes.body.status === 'DISCOVERED' && createOppRes.body.url === 'https://example.com/post', 'Test 3: Create opportunity validates and normalizes URL', createOppRes);
    oppId = createOppRes.body.id;

    // 4. List opportunities (Authenticated)
    const listOppRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set(mockAuthHeaders);
    assert(listOppRes.status === 200 && listOppRes.body.data.length === 1 && listOppRes.body.data[0].id === oppId, 'Test 4: List opportunities returns correct records');

    // 5. Get opportunity
    const getOppRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}`)
      .set(mockAuthHeaders);
    assert(getOppRes.status === 200 && getOppRes.body.domainAuthority === 50, 'Test 5: Get opportunity returns correct record', getOppRes);

    // 6. Update opportunity
    const updateOppRes = await request(app)
      .patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}`)
      .set(mockAuthHeaders)
      .send({ domainAuthority: 60, suggestedAnchor: 'Test Anchor' });
    assert(updateOppRes.status === 200 && updateOppRes.body.domainAuthority === 60 && updateOppRes.body.suggestedAnchor === 'Test Anchor', 'Test 6: Update opportunity modifies allowed fields');

    // 8. Filter by status
    const filterStatusRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities?status=DISCOVERED`)
      .set(mockAuthHeaders);
    assert(filterStatusRes.body.data.length === 1, 'Test 8: Filter by status works');

    // 9. Filter by type
    const filterTypeRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities?type=GUEST_POST`)
      .set(mockAuthHeaders);
    assert(filterTypeRes.body.data.length === 0, 'Test 9: Filter by type works');

    // 10. Pagination
    const pageRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities?page=1&limit=1`)
      .set(mockAuthHeaders);
    assert(pageRes.body.meta.total === 1 && pageRes.body.meta.limit === 1, 'Test 10: Pagination works');

    // 11. Valid transition accepted (DISCOVERED -> QUALIFIED)
    const validTransRes = await request(app)
      .patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}/status`)
      .set(mockAuthHeaders)
      .send({ status: 'QUALIFIED' });
    assert(validTransRes.status === 200 && validTransRes.body.status === 'QUALIFIED', 'Test 11: Valid transition accepted');

    // 12. Invalid transition rejected (QUALIFIED -> LINK_ACQUIRED)
    const invalidTransRes = await request(app)
      .patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}/status`)
      .set(mockAuthHeaders)
      .send({ status: 'LINK_ACQUIRED' });
    assert(invalidTransRes.status === 400 && invalidTransRes.body.error === 'Bad Request', 'Test 12: Invalid transition rejected');

    // Fast forward to ACCEPTED
    await request(app).patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}/status`).set(mockAuthHeaders).send({ status: 'READY' });
    await request(app).patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}/status`).set(mockAuthHeaders).send({ status: 'CONTACTED' });
    await request(app).patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}/status`).set(mockAuthHeaders).send({ status: 'REPLIED' });
    await request(app).patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}/status`).set(mockAuthHeaders).send({ status: 'ACCEPTED' });

    // 13. LINK_ACQUIRED transition handled correctly and auto-creates backlink
    const acquireRes = await request(app)
      .patch(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}/status`)
      .set(mockAuthHeaders)
      .send({ status: 'LINK_ACQUIRED', sourceUrl: 'https://example.com/post', targetUrl: 'https://mock.com' });
    assert(acquireRes.status === 200 && acquireRes.body.status === 'LINK_ACQUIRED', 'Test 13a: LINK_ACQUIRED transition accepted');

    const listBlRes = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks`).set(mockAuthHeaders);
    assert(listBlRes.body.data.length === 1 && listBlRes.body.data[0].sourceUrl === 'https://example.com/post', 'Test 13b: LINK_ACQUIRED auto-creates Backlink record');

    // 15. Create backlink manually
    const manualBlRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks`)
      .set(mockAuthHeaders)
      .send({ sourceUrl: 'https://manual.com/blog', targetUrl: 'https://mock.com', referringDomain: 'manual.com', anchorText: 'Manual' });
    assert(manualBlRes.status === 201 && manualBlRes.body.referringDomain === 'manual.com', 'Test 15: Create backlink works');
    backlinkId = manualBlRes.body.id;

    // 17. Get backlink
    const getBlRes = await request(app).get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${backlinkId}`).set(mockAuthHeaders);
    assert(getBlRes.status === 200 && getBlRes.body.anchorText === 'Manual', 'Test 17: Get backlink works');

    // 18. Update backlink
    const updateBlRes = await request(app).patch(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${backlinkId}`).set(mockAuthHeaders).send({ status: 'LOST' });
    assert(updateBlRes.status === 200 && updateBlRes.body.status === 'LOST', 'Test 18: Update backlink works');

    // 20. Invalid URL rejected
    const badUrlRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks`)
      .set(mockAuthHeaders)
      .send({ sourceUrl: 'not-a-url', targetUrl: 'https://mock.com', referringDomain: 'manual.com' });
    assert(badUrlRes.status === 400, 'Test 20: Invalid URL rejected');

    // 21. Invalid enum rejected
    const badEnumRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set(mockAuthHeaders)
      .send({ domain: 'test.com', type: 'INVALID_TYPE' });
    assert(badEnumRes.status === 400, 'Test 21: Invalid enum rejected');

    // 22. Invalid domainAuthority rejected
    const badDaRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set(mockAuthHeaders)
      .send({ domain: 'test.com', type: 'GUEST_POST', domainAuthority: 150 });
    assert(badDaRes.status === 400, 'Test 22: Invalid domainAuthority rejected (> 100)');

    // 24. Malicious URL schemes rejected
    const jsUrlRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks`)
      .set(mockAuthHeaders)
      .send({ sourceUrl: 'javascript:alert(1)', targetUrl: 'https://mock.com', referringDomain: 'manual.com' });
    assert(jsUrlRes.status === 400, 'Test 24: Malicious URL schemes rejected');

    // TENANT ISOLATION
    // 25. User A cannot read User B opportunity
    const iso25 = await request(app).get(`/api/websites/${OTHER_WEBSITE_ID}/backlink-opportunities/${otherOppId}`).set(mockAuthHeaders);
    assert(iso25.status === 404, 'Test 25: User A cannot read User B opportunity (404)');

    // 26. User A cannot update User B opportunity
    const iso26 = await request(app).patch(`/api/websites/${OTHER_WEBSITE_ID}/backlink-opportunities/${otherOppId}`).set(mockAuthHeaders).send({ relevance: 99 });
    assert(iso26.status === 404, 'Test 26: User A cannot update User B opportunity (404)');

    // 27. User A cannot change User B status
    const iso27 = await request(app).patch(`/api/websites/${OTHER_WEBSITE_ID}/backlink-opportunities/${otherOppId}/status`).set(mockAuthHeaders).send({ status: 'QUALIFIED' });
    assert(iso27.status === 404, 'Test 27: User A cannot change User B status (404)');

    // 28. User A cannot delete User B opportunity
    const iso28 = await request(app).delete(`/api/websites/${OTHER_WEBSITE_ID}/backlink-opportunities/${otherOppId}`).set(mockAuthHeaders);
    assert(iso28.status === 404, 'Test 28: User A cannot delete User B opportunity (404)');

    // 29. User A cannot read User B backlink
    const iso29 = await request(app).get(`/api/websites/${OTHER_WEBSITE_ID}/backlinks/${otherBacklinkId}`).set(mockAuthHeaders);
    assert(iso29.status === 404, 'Test 29: User A cannot read User B backlink (404)');

    // 30. User A cannot update User B backlink
    const iso30 = await request(app).patch(`/api/websites/${OTHER_WEBSITE_ID}/backlinks/${otherBacklinkId}`).set(mockAuthHeaders).send({ status: 'LOST' });
    assert(iso30.status === 404, 'Test 30: User A cannot update User B backlink (404)');

    // 31. User A cannot delete User B backlink
    const iso31 = await request(app).delete(`/api/websites/${OTHER_WEBSITE_ID}/backlinks/${otherBacklinkId}`).set(mockAuthHeaders);
    assert(iso31.status === 404, 'Test 31: User A cannot delete User B backlink (404)');

    // 7. Delete opportunity (User A deleting their own)
    const delOppRes = await request(app).delete(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppId}`).set(mockAuthHeaders);
    assert(delOppRes.status === 204, 'Test 7: Delete opportunity works');

    // 19. Delete backlink (User A deleting their own)
    const delBlRes = await request(app).delete(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${backlinkId}`).set(mockAuthHeaders);
    assert(delBlRes.status === 204, 'Test 19: Delete backlink works');

    // ============================================================================
    // VERIFICATION API ENDPOINT TESTS (STEP 12E-5)
    // ============================================================================
    
    // Create a new backlink for verification tests
    const verifyBlRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks`)
      .set(mockAuthHeaders)
      .send({ sourceUrl: 'https://test.com/post', targetUrl: 'https://mock.com', referringDomain: 'test.com', status: 'ACTIVE' });
    const vBlId = verifyBlRes.body.id;

    // B. Unauthenticated request is rejected
    const vUnauthRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`);
    assert(vUnauthRes.status === 401, 'Test V1: Unauthenticated verification request rejected');

    // C. Unsubscribed user is rejected
    await prisma.subscription.deleteMany({ where: { userId: MOCK_USER_ID } });
    const vUnsubRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vUnsubRes.status === 403, 'Test V2: Unsubscribed verification request rejected');
    
    // Restore subscription for following tests
    await prisma.subscription.create({
      data: { userId: MOCK_USER_ID, plan: 'pro', interval: 'month', status: 'active' }
    });

    // D/E. Tenant Isolation: user cannot verify another user's backlink
    const vTenantIsoRes = await request(app).post(`/api/websites/${OTHER_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vTenantIsoRes.status === 404, 'Test V3: User cannot verify another user backlink (tenant isolation)');

    // F. Nonexistent backlink returns standard not-found response
    const vNotFoundRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/non-existent-id/verify`).set(mockAuthHeaders);
    assert(vNotFoundRes.status === 404, 'Test V4: Nonexistent backlink returns 404');

    // A/H/N/O/P. Authenticated user queues job successfully without altering premature state or exposing internals
    const vSuccessRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vSuccessRes.status === 202, 'Test V5: Authenticated subscribed user can queue verification');
    assert(vSuccessRes.body.success === true && vSuccessRes.body.jobId && vSuccessRes.body.verificationStatus === 'UNVERIFIED', 'Test V6: Response format is safe and accurate');
    
    // Check job creation in DB
    const jobId1 = vSuccessRes.body.jobId;
    const vJob1 = await prisma.backgroundJob.findUnique({ where: { id: jobId1 } });
    assert(vJob1 && vJob1.type === 'BACKLINK_VERIFICATION', 'Test V7: BackgroundJob created');
    assert(vJob1 && (vJob1.payload as any).backlinkId === vBlId && Object.keys(vJob1.payload as any).length === 1, 'Test V8: Job payload contains exactly and safely { backlinkId }');

    // Check Backlink status untouched
    const vBlCheck1 = await prisma.backlink.findUnique({ where: { id: vBlId } });
    assert(vBlCheck1 && vBlCheck1.status === 'ACTIVE' && vBlCheck1.verificationStatus === 'UNVERIFIED', 'Test V9: Premature state mutation prevented');

    // I. Duplicate QUEUED job does not create another job
    const vDupQueuedRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vDupQueuedRes.status === 202 && vDupQueuedRes.body.jobId === jobId1 && vDupQueuedRes.body.message.includes('already queued'), 'Test V10: Duplicate QUEUED job prevented');

    // J. Duplicate PROCESSING job does not create another job
    await prisma.backgroundJob.update({ where: { id: jobId1 }, data: { status: 'PROCESSING' } });
    const vDupProcRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vDupProcRes.status === 202 && vDupProcRes.body.jobId === jobId1, 'Test V11: Duplicate PROCESSING job prevented');

    // K. COMPLETED old job allows new request
    await prisma.backgroundJob.update({ where: { id: jobId1 }, data: { status: 'COMPLETED' } });
    const vCompletedRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vCompletedRes.status === 202 && vCompletedRes.body.jobId !== jobId1, 'Test V12: COMPLETED old job allows new verification request');
    const jobId2 = vCompletedRes.body.jobId;

    // L. FAILED old job allows new request
    await prisma.backgroundJob.update({ where: { id: jobId2 }, data: { status: 'FAILED' } });
    const vFailedRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vFailedRes.status === 202 && vFailedRes.body.jobId !== jobId2, 'Test V13: FAILED old job allows new verification request');
    const jobId3 = vFailedRes.body.jobId;

    // M. CANCELLED old job allows new request
    await prisma.backgroundJob.update({ where: { id: jobId3 }, data: { status: 'CANCELLED' } });
    const vCancelledRes = await request(app).post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verify`).set(mockAuthHeaders);
    assert(vCancelledRes.status === 202 && vCancelledRes.body.jobId !== jobId3, 'Test V14: CANCELLED old job allows new verification request');

    // G. Malformed IDs are handled safely
    const vMalformedRes = await request(app).post(`/api/websites/not-uuid/backlinks/not-uuid/verify`).set(mockAuthHeaders);
    assert(vMalformedRes.status === 404 || vMalformedRes.status === 400, 'Test V15: Malformed IDs rejected safely');

    // ============================================================================
    // DISCOVERY, QUALIFY, CAMPAIGN & VERIFICATION-JOB AUTHENTICATED TESTS
    // ============================================================================

    // Test C1: Authenticated backlink discovery succeeds
    const discRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/discover`)
      .set(mockAuthHeaders)
      .send({ topic: 'SaaS SEO' });
    assert(discRes.status === 200 && Array.isArray(discRes.body.candidates), 'Test C1: Authenticated backlink discovery succeeds (200)');

    // Create an opportunity specifically for qualification and campaign tests
    const oppForCampRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities`)
      .set(mockAuthHeaders)
      .send({ domain: 'outreach-target.com', url: 'https://outreach-target.com/resources', type: 'RESOURCE_PAGE' });
    const oppForCampId = oppForCampRes.body.id;

    // Test C2: Authenticated qualify opportunity succeeds
    const qualifyRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppForCampId}/qualify`)
      .set(mockAuthHeaders);
    assert(qualifyRes.status === 200 && qualifyRes.body.id === oppForCampId, 'Test C2: Authenticated qualify opportunity succeeds (200)');

    // Test C3: Authenticated create outreach campaign succeeds
    const createCampRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns`)
      .set(mockAuthHeaders)
      .send({ opportunityId: oppForCampId });
    assert(createCampRes.status === 201 && createCampRes.body.opportunityId === oppForCampId, 'Test C3: Authenticated create outreach campaign succeeds (201)');
    const campaignId = createCampRes.body.id;

    // Test C4: Authenticated list outreach campaigns succeeds
    const listCampRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns`)
      .set(mockAuthHeaders);
    assert(listCampRes.status === 200 && Array.isArray(listCampRes.body.data) && listCampRes.body.data.some((c: any) => c.id === campaignId), 'Test C4: Authenticated list campaigns succeeds (200)');

    // Test C5: Authenticated update campaign status succeeds
    const updateCampStatusRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns/${campaignId}/status`)
      .set(mockAuthHeaders)
      .send({ status: 'CONTACTED' });
    assert(updateCampStatusRes.status === 200 && updateCampStatusRes.body.status === 'CONTACTED', 'Test C5: Authenticated update campaign status succeeds (200)');

    // Test C6: Authenticated generate AI message succeeds
    const genMsgRes = await request(app)
      .post(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns/${campaignId}/generate-message`)
      .set(mockAuthHeaders);
    assert(genMsgRes.status === 200 && genMsgRes.body.id === campaignId, 'Test C6: Authenticated generate AI message succeeds (200)');

    // Test C7: Authenticated verification job polling succeeds
    const jobPollRes = await request(app)
      .get(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/${vBlId}/verification-job`)
      .set(mockAuthHeaders);
    assert(jobPollRes.status === 200 && jobPollRes.body.backlink?.id === vBlId, 'Test C7: Authenticated verification job polling succeeds (200)');

    // Clean up campaign & opportunity
    await request(app).delete(`/api/websites/${MOCK_WEBSITE_ID}/backlinks/campaigns/${campaignId}`).set(mockAuthHeaders);
    await request(app).delete(`/api/websites/${MOCK_WEBSITE_ID}/backlink-opportunities/${oppForCampId}`).set(mockAuthHeaders);

  } catch (error) {
    console.error('Unhandled test failure', error);
  } finally {
    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`==================================================\n`);
    await prisma.$disconnect();
    if (failed > 0) process.exit(1);
  }
}

runTests();
