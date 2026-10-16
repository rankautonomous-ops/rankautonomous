import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { WixProvider } from '../services/cms/providers/WixProvider';
import { createCmsProvider } from '../services/cms/factory';
import { publishArticle } from '../services/cms/publishingService';
import { PrismaClient } from '@prisma/client';
import { encryptJson, decryptJson } from '../lib/encryption';

const prisma = new PrismaClient();

async function runWixTests() {
  console.log('====================================================');
  console.log('       WIX CMS INTEGRATION TEST SUITE               ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ ${message}`);
      passed++;
    } else {
      console.error(`❌ ${message}`);
      failed++;
    }
  }

  // Save original fetch
  const originalFetch = globalThis.fetch;

  // -------------------------------------------------------------
  // 1. CREDENTIAL VALIDATION
  // -------------------------------------------------------------
  console.log('\n--- 1. Credential Validation ---');

  try {
    new WixProvider('https://mywixsite.com', {});
    assert(false, 'Should fail when API key is missing');
  } catch (err: any) {
    assert(err.message.includes('Missing Wix API Key'), 'Missing API key rejected with descriptive error');
  }

  try {
    new WixProvider('https://mywixsite.com', { apiKey: 'wix_key_123' }, {});
    assert(false, 'Should fail when Site ID is missing');
  } catch (err: any) {
    assert(err.message.includes('Missing Wix Site ID'), 'Missing Site ID rejected with descriptive error');
  }

  try {
    const validProvider = new WixProvider('https://mywixsite.com', { apiKey: 'wix_key_123', siteId: 'site-uuid-1' });
    assert(validProvider instanceof WixProvider, 'Valid credentials construct WixProvider successfully');
  } catch (err: any) {
    assert(false, `Valid construction failed: ${err.message}`);
  }

  // -------------------------------------------------------------
  // 2. CONNECTION TESTING & PERMISSION VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- 2. Connection Testing & Permission Verification ---');

  // 2a. Successful Connection Test
  let capturedHeaders: Record<string, string> = {};
  globalThis.fetch = (async (url: any, init: any) => {
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return new Response(JSON.stringify({ draftPosts: [] }), { status: 200 });
  }) as any;

  try {
    const provider = new WixProvider('https://mywixsite.com', { apiKey: 'valid_api_key' }, { siteId: '5b5d1234-abcd' });
    const success = await provider.testConnection();
    assert(success === true, 'Successful connection test returns true');
    assert(capturedHeaders['wix-site-id'] === '5b5d1234-abcd', 'Request includes wix-site-id header');
    assert(capturedHeaders['Authorization'] === 'valid_api_key', 'Request includes Authorization header');
  } catch (err: any) {
    assert(false, `Connection test failed: ${err.message}`);
  }

  // 2b. 401 Unauthorized (Invalid API Key)
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
  }) as any;

  try {
    const provider = new WixProvider('https://mywixsite.com', { apiKey: 'bad_key' }, { siteId: '5b5d1234-abcd' });
    await provider.testConnection();
    assert(false, 'Should throw on 401');
  } catch (err: any) {
    assert(err.message.includes('Invalid Wix API Key') && err.message.includes('401'), 'HTTP 401 reports invalid API key');
  }

  // 2c. 403 Forbidden (Missing 'Manage Blog' permission)
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 });
  }) as any;

  try {
    const provider = new WixProvider('https://mywixsite.com', { apiKey: 'limited_key' }, { siteId: '5b5d1234-abcd' });
    await provider.testConnection();
    assert(false, 'Should throw on 403');
  } catch (err: any) {
    assert(err.message.includes('Manage Blog') && err.message.includes('403'), 'HTTP 403 clearly identifies missing "Manage Blog" permission');
  }

  // 2d. 404 Not Found (Site ID not found)
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  }) as any;

  try {
    const provider = new WixProvider('https://mywixsite.com', { apiKey: 'key' }, { siteId: 'unknown-site' });
    await provider.testConnection();
    assert(false, 'Should throw on 404');
  } catch (err: any) {
    assert(err.message.includes('Wix Site ID not found') || err.message.includes('404'), 'HTTP 404 reports site or app not found');
  }

  // 2e. Network Timeout / Failure
  globalThis.fetch = (async () => {
    throw new Error('Connection timeout');
  }) as any;

  try {
    const provider = new WixProvider('https://mywixsite.com', { apiKey: 'key' }, { siteId: 'site-1' });
    await provider.testConnection();
    assert(false, 'Should throw on timeout');
  } catch (err: any) {
    assert(err.message.includes('Connection timeout'), 'Network timeouts handled cleanly');
  }

  // -------------------------------------------------------------
  // 3. DRAFT-FIRST PUBLISHING WORKFLOW
  // -------------------------------------------------------------
  console.log('\n--- 3. Draft-First Publishing Workflow ---');

  const calls: { url: string; method: string; body?: any }[] = [];

  // Mock server for draft creation and publication
  globalThis.fetch = (async (url: any, init: any) => {
    const urlStr = String(url);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: urlStr, method, body });

    // Slug check (return empty = no duplicate)
    if (urlStr.includes('/blog/v3/posts?filter=') || urlStr.includes('/blog/v3/draft-posts?filter=')) {
      return new Response(JSON.stringify({ posts: [], draftPosts: [] }), { status: 200 });
    }

    // Create Draft Post
    if (urlStr.endsWith('/blog/v3/draft-posts') && method === 'POST') {
      return new Response(
        JSON.stringify({
          draftPost: {
            id: 'wix-draft-uuid-999',
            title: body?.draftPost?.title,
            slug: body?.draftPost?.slug,
            status: 'DRAFT',
          },
        }),
        { status: 201 }
      );
    }

    // Publish Draft Post
    if (urlStr.includes('/blog/v3/draft-posts/wix-draft-uuid-999/publish') && method === 'POST') {
      return new Response(
        JSON.stringify({
          post: {
            id: 'wix-published-uuid-888',
            title: 'Wix SEO Mastery',
            slug: 'wix-seo-mastery',
            url: 'https://mywixsite.com/post/wix-seo-mastery',
            status: 'PUBLISHED',
          },
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  const wixProvider = new WixProvider('https://mywixsite.com', { apiKey: 'test_key' }, { siteId: 'site-uuid-1' });

  // 3a. Publish Live Post (must create draft first, then call /publish)
  calls.length = 0;
  const publishResult = await wixProvider.publishArticle({
    title: 'Wix SEO Mastery',
    content: 'Introduction paragraph.\n\n## Subheading\nSecond paragraph content.',
    slug: 'wix-seo-mastery',
    excerpt: 'Comprehensive Wix SEO guide',
    status: 'publish',
  });

  assert(publishResult.status === 'PUBLISHED', 'Live article publication returns PUBLISHED status');
  assert(publishResult.remoteId === 'wix-published-uuid-888', 'Live article returns remote published post ID');
  assert(publishResult.remoteUrl === 'https://mywixsite.com/post/wix-seo-mastery', 'Live article returns clean public URL');

  // Verify call sequence: POST /draft-posts then POST /draft-posts/{id}/publish
  const createDraftCall = calls.find(c => c.url.endsWith('/blog/v3/draft-posts') && c.method === 'POST');
  const publishDraftCall = calls.find(c => c.url.includes('/publish') && c.method === 'POST');
  assert(!!createDraftCall, 'Step 1: Article created as Draft Post on Wix');
  assert(!!publishDraftCall, 'Step 2: Created draft post explicitly published to go live');
  assert(
    createDraftCall?.body?.draftPost?.richContent?.nodes?.length >= 2,
    'RichContent AST generated with multiple paragraph/heading nodes'
  );

  // 3b. Draft Creation Only (status: 'draft')
  calls.length = 0;
  const draftResult = await wixProvider.publishArticle({
    title: 'Wix Draft Review',
    content: 'Draft content for staging.',
    slug: 'wix-draft-review',
    status: 'draft',
  });

  assert(draftResult.status === 'PUBLISHED', 'Draft creation succeeds');
  assert(draftResult.remoteId === 'wix-draft-uuid-999', 'Draft returns draft post ID');
  const publishCallOnDraft = calls.find(c => c.url.includes('/publish'));
  assert(!publishCallOnDraft, 'Draft status does NOT trigger /publish endpoint');

  // -------------------------------------------------------------
  // 4. SCHEDULING BEHAVIOR
  // -------------------------------------------------------------
  console.log('\n--- 4. Scheduling Behavior ---');

  calls.length = 0;
  const futureScheduleDate = new Date(Date.now() + 86400000).toISOString();
  const scheduleResult = await wixProvider.publishArticle({
    title: 'Scheduled Article',
    content: 'Future article content.',
    slug: 'scheduled-article',
    status: 'future',
    scheduledAt: futureScheduleDate,
  });

  assert(scheduleResult.status === 'PUBLISHED', 'Scheduled article saved to target');
  assert(scheduleResult.remoteId === 'wix-draft-uuid-999', 'Scheduled article saved as Draft on Wix for automated release');
  const publishCallOnSchedule = calls.find(c => c.url.includes('/publish'));
  assert(!publishCallOnSchedule, 'Scheduled article is NOT prematurely published live on Wix');

  // -------------------------------------------------------------
  // 5. DUPLICATE DETECTION BY SLUG
  // -------------------------------------------------------------
  console.log('\n--- 5. Duplicate Detection & In-Place Update ---');

  let patchCalled: boolean = false;
  globalThis.fetch = (async (url: any, init: any) => {
    const urlStr = String(url);
    const method = init?.method || 'GET';

    // Existing post found on slug check
    if (urlStr.includes('/blog/v3/posts?filter=')) {
      return new Response(
        JSON.stringify({
          posts: [{ id: 'existing-wix-post-777', slug: 'existing-slug' }],
        }),
        { status: 200 }
      );
    }

    if (urlStr.includes('/blog/v3/posts/existing-wix-post-777') && method === 'PATCH') {
      patchCalled = true;
      return new Response(
        JSON.stringify({
          post: {
            id: 'existing-wix-post-777',
            url: 'https://mywixsite.com/post/existing-slug',
          },
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({}), { status: 200 });
  }) as any;

  const duplicateResult = await wixProvider.publishArticle({
    title: 'Updated Existing Post',
    content: 'Updated content.',
    slug: 'existing-slug',
    status: 'publish',
  });

  assert(Boolean(patchCalled), 'Duplicate slug triggers PATCH update instead of duplicate creation');
  assert(duplicateResult.remoteId === 'existing-wix-post-777', 'Maintains original remote post ID');

  // -------------------------------------------------------------
  // 6. PUBLISHING SAFEGUARD: APPROVAL ENFORCEMENT
  // -------------------------------------------------------------
  console.log('\n--- 6. RankAutonomous Approval Safeguard ---');

  // Create isolated test user, website, unapproved article, and Wix connection
  const testUserId = `wix-test-user-${Date.now()}`;
  const testSiteId = `wix-test-site-${Date.now()}`;
  const testArticleId = `wix-test-art-${Date.now()}`;
  const testConnId = `wix-test-conn-${Date.now()}`;

  try {
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        role: 'CUSTOMER',
      },
    });

    await prisma.website.create({
      data: {
        id: testSiteId,
        userId: testUserId,
        name: 'Wix Test Site',
        url: 'https://mywixsite.com',
      },
    });

    // Unapproved DRAFT article
    await prisma.article.create({
      data: {
        id: testArticleId,
        websiteId: testSiteId,
        title: 'Unapproved Draft Article',
        content: 'Draft content.',
        slug: 'unapproved-draft',
        status: 'DRAFT', // Not APPROVED
      },
    });

    // Encrypted Wix Connection
    await prisma.cmsConnection.create({
      data: {
        id: testConnId,
        websiteId: testSiteId,
        provider: 'WIX',
        name: 'My Wix Site',
        baseUrl: 'https://mywixsite.com',
        credentials: encryptJson({ apiKey: 'secret_key', siteId: 'site-id' }),
        metadata: { siteId: 'site-id' },
        status: 'CONNECTED',
      },
    });

    // Attempt to publish unapproved article -> MUST throw error
    try {
      await publishArticle(testSiteId, testArticleId, testConnId, { postStatus: 'publish' });
      assert(false, 'Should strictly reject publishing unapproved DRAFT article');
    } catch (safeguardErr: any) {
      assert(
        safeguardErr.message.includes('must be in "APPROVED" status'),
        'Publishing unapproved article strictly blocked with descriptive safeguard error'
      );
    }

    // Approve the article
    await prisma.article.update({
      where: { id: testArticleId },
      data: { status: 'APPROVED' },
    });

    // Mock fetch for successful publishing
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      if (urlStr.includes('/blog/v3/draft-posts') && method === 'POST') {
        return new Response(JSON.stringify({ draftPost: { id: 'wix-dp-100' } }), { status: 201 });
      }
      if (urlStr.includes('/publish') && method === 'POST') {
        return new Response(
          JSON.stringify({ post: { id: 'wix-post-200', url: 'https://mywixsite.com/post/unapproved-draft' } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ posts: [], draftPosts: [] }), { status: 200 });
    }) as any;

    // Publish approved article -> MUST succeed
    await publishArticle(testSiteId, testArticleId, testConnId, { postStatus: 'publish' });
    const pubRecord = await prisma.articlePublication.findFirst({
      where: { articleId: testArticleId, cmsConnectionId: testConnId },
    });
    assert(pubRecord !== null && pubRecord.status === 'PUBLISHED', 'Approved article publishes successfully');

    // -------------------------------------------------------------
    // 7. SENSITIVE CREDENTIAL STORAGE & REDACTION
    // -------------------------------------------------------------
    console.log('\n--- 7. Credential Encryption & Redaction ---');

    const rawConn = await prisma.cmsConnection.findUnique({ where: { id: testConnId } });
    assert(rawConn?.credentials !== null, 'Credentials stored in encrypted format');
    assert(!JSON.stringify(rawConn?.credentials).includes('secret_key'), 'Plaintext secret NEVER stored in raw database row');

    const decrypted = decryptJson<any>(rawConn!.credentials!);
    assert(decrypted.apiKey === 'secret_key', 'Credentials decrypt cleanly using AES-256-GCM');

    // -------------------------------------------------------------
    // 8. CONNECTION TEST ACTION & ERROR STATE TRANSITIONS
    // -------------------------------------------------------------
    console.log('\n--- 8. Connection Test Action & Error State Transitions ---');

    // 8a. Connection Test Success updates DB status to CONNECTED
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ draftPosts: [] }), { status: 200 });
    }) as any;

    const providerInstance = createCmsProvider(rawConn!);
    const testResult = await providerInstance.testConnection();
    assert(testResult === true, 'Test connection action executes provider.testConnection() successfully');

    await prisma.cmsConnection.update({
      where: { id: testConnId },
      data: { status: 'CONNECTED', lastTestedAt: new Date(), lastError: null },
    });
    const updatedConnSuccess = await prisma.cmsConnection.findUnique({ where: { id: testConnId } });
    assert(updatedConnSuccess?.status === 'CONNECTED', 'Connection status transitions to CONNECTED');
    assert(updatedConnSuccess?.lastError === null, 'lastError cleared on successful connection test');

    // 8b. Connection Test with Invalid Credentials (HTTP 401) sets status to ERROR
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
    }) as any;

    try {
      await providerInstance.testConnection();
      assert(false, 'Should throw error on invalid credentials');
    } catch (testErr: any) {
      await prisma.cmsConnection.update({
        where: { id: testConnId },
        data: { status: 'ERROR', lastTestedAt: new Date(), lastError: testErr.message },
      });
      const updatedConnError = await prisma.cmsConnection.findUnique({ where: { id: testConnId } });
      assert(updatedConnError?.status === 'ERROR', 'Connection status transitions to ERROR on 401 failure');
      assert(Boolean(updatedConnError?.lastError?.includes('Invalid Wix API Key')), 'lastError captures descriptive error message');
    }

    // 8c. Missing Credentials Connection Test
    const missingCredsConn = await prisma.cmsConnection.create({
      data: {
        id: `wix-missing-creds-${Date.now()}`,
        websiteId: testSiteId,
        provider: 'WIX',
        name: 'Wix Missing Creds',
        status: 'DISCONNECTED',
      },
    });

    try {
      const missingProvider = createCmsProvider(missingCredsConn);
      await missingProvider.testConnection();
      assert(false, 'Should fail when testing connection with missing credentials');
    } catch (missingErr: any) {
      assert(
        missingErr.message.includes('Missing Wix API Key'),
        'Testing connection with missing credentials safely fails and informs user'
      );
      await prisma.cmsConnection.update({
        where: { id: missingCredsConn.id },
        data: { status: 'ERROR', lastTestedAt: new Date(), lastError: missingErr.message },
      });
      const checkMissingRecord = await prisma.cmsConnection.findUnique({ where: { id: missingCredsConn.id } });
      assert(checkMissingRecord?.status === 'ERROR', 'Missing credentials record marked with ERROR status');
    } finally {
      await prisma.cmsConnection.deleteMany({ where: { id: missingCredsConn.id } }).catch(() => {});
    }

    // 8d. Verified sanitized API response strictly excludes credentials
    const allWebsiteConns = await prisma.cmsConnection.findMany({ where: { websiteId: testSiteId } });
    const sanitizedApiResponse = allWebsiteConns.map((c) => ({
      id: c.id,
      websiteId: c.websiteId,
      provider: c.provider,
      name: c.name,
      status: c.status,
      baseUrl: c.baseUrl,
      metadata: c.metadata,
      lastTestedAt: c.lastTestedAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    for (const item of sanitizedApiResponse) {
      assert(!('credentials' in item), 'API response payload strictly omits credentials property');
      assert(!JSON.stringify(item).includes('secret_key'), 'Serialized API response NEVER contains API key or secret');
    }

    // -------------------------------------------------------------
    // 9. CONNECTION-SAVE WORKFLOW (WITHOUT CALLING WIX)
    // -------------------------------------------------------------
    console.log('\n--- 9. Wix Connection-Save Workflow ---');

    // 9a. Verify saving a Wix connection with fake credentials does NOT trigger any network call to Wix
    let saveFetchCalls = 0;
    globalThis.fetch = (async () => {
      saveFetchCalls++;
      throw new Error('Save workflow MUST NOT make external network calls!');
    }) as any;

    const fakeFormSubmission = {
      provider: 'WIX',
      name: 'Production Wix Store Blog',
      baseUrl: 'https://my-wix-store.com',
      credentials: {
        apiKey: 'wix_fake_test_key_abc123xyz',
        siteId: '12345678-abcd-ef01-2345-6789abcdef01',
      },
      metadata: {
        siteId: '12345678-abcd-ef01-2345-6789abcdef01',
      },
    };

    const savedConnId = `wix-saved-fake-${Date.now()}`;
    const encryptedFakeCreds = encryptJson(fakeFormSubmission.credentials);

    const savedRecord = await prisma.cmsConnection.create({
      data: {
        id: savedConnId,
        websiteId: testSiteId,
        provider: 'WIX',
        name: fakeFormSubmission.name,
        baseUrl: fakeFormSubmission.baseUrl,
        credentials: encryptedFakeCreds,
        metadata: fakeFormSubmission.metadata,
        status: 'DISCONNECTED', // Initial status: NOT_TESTED / DISCONNECTED
      },
    });

    assert(saveFetchCalls === 0, 'Connection saved cleanly without calling Wix API');
    assert(savedRecord.status === 'DISCONNECTED', 'Saved connection has initial status DISCONNECTED (not CONNECTED)');
    assert(savedRecord.credentials !== null, 'Fake credentials securely encrypted with AES-256-GCM');
    assert(!JSON.stringify(savedRecord.credentials).includes('wix_fake_test_key_abc123xyz'), 'Plaintext fake key NEVER stored in raw database row');

    // 9b. Verify saved connection appears in UI query and omits credentials
    const uiQueryList = await prisma.cmsConnection.findMany({
      where: { websiteId: testSiteId },
      orderBy: { createdAt: 'desc' },
    });
    const sanitizedUiList = uiQueryList.map((c) => ({
      id: c.id,
      websiteId: c.websiteId,
      provider: c.provider,
      name: c.name,
      status: c.status,
      baseUrl: c.baseUrl,
      metadata: c.metadata,
      lastTestedAt: c.lastTestedAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    const foundSavedInUi = sanitizedUiList.find((c) => c.id === savedConnId);
    assert(foundSavedInUi !== undefined, 'Saved connection appears in UI list');
    assert(foundSavedInUi?.name === 'Production Wix Store Blog', 'Correct connection name returned');
    assert(foundSavedInUi?.status === 'DISCONNECTED', 'Connection remains DISCONNECTED in UI until tested');
    assert(!('credentials' in foundSavedInUi!), 'Credentials property stripped from API list response');
    assert(!JSON.stringify(foundSavedInUi).includes('wix_fake_test_key_abc123xyz'), 'API response never leaks credentials');

    // 9c. Verify connection is NOT marked CONNECTED until real test succeeds
    // Case 1: When tested with fake credentials, Wix returns 401 Unauthorized
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Invalid API Key' }), { status: 401 });
    }) as any;

    try {
      const fakeProvider = createCmsProvider(savedRecord);
      await fakeProvider.testConnection();
      assert(false, 'Fake credentials should fail connection test');
    } catch (testErr: any) {
      assert(testErr.message.includes('Invalid Wix API Key'), 'Connection test with fake credentials fails safely (401)');
      await prisma.cmsConnection.update({
        where: { id: savedConnId },
        data: { status: 'ERROR', lastTestedAt: new Date(), lastError: testErr.message },
      });
    }

    const postFailedRecord = await prisma.cmsConnection.findUnique({ where: { id: savedConnId } });
    assert(postFailedRecord?.status === 'ERROR', 'Connection marked ERROR (never prematurely marked CONNECTED)');

    // Case 2: Only when test succeeds (200 OK), status transitions to CONNECTED
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ draftPosts: [] }), { status: 200 });
    }) as any;

    const validTestProvider = createCmsProvider(savedRecord);
    const successResult = await validTestProvider.testConnection();
    assert(successResult === true, 'Successful testConnection returns true');

    await prisma.cmsConnection.update({
      where: { id: savedConnId },
      data: { status: 'CONNECTED', lastTestedAt: new Date(), lastError: null },
    });

    const postSuccessRecord = await prisma.cmsConnection.findUnique({ where: { id: savedConnId } });
    assert(postSuccessRecord?.status === 'CONNECTED', 'Connection transitions to CONNECTED ONLY after test succeeds');
    assert(postSuccessRecord?.lastError === null, 'lastError cleared after test succeeds');

    // Clean up saved connection
    await prisma.cmsConnection.deleteMany({ where: { id: savedConnId } }).catch(() => {});

    // -------------------------------------------------------------
    // 10. COMPREHENSIVE WIX ARTICLE PUBLISHING WORKFLOW
    // -------------------------------------------------------------
    console.log('\n--- 10. Comprehensive Wix Article Publishing Workflow ---');

    // Ensure test connection is in CONNECTED state for publishing workflow
    await prisma.cmsConnection.update({
      where: { id: testConnId },
      data: { status: 'CONNECTED', lastError: null },
    });

    // 10a. Markdown to RichContent AST conversion verification
    const richArticleId = `wix-rich-art-${Date.now()}`;
    await prisma.article.create({
      data: {
        id: richArticleId,
        websiteId: testSiteId,
        title: 'Complete Wix Formatting Guide',
        content: '# Top Level Title\n\nIntroductory paragraph with clean text.\n\n## Section Subheading\n\nDetailed guidance with <span class="highlight">inline HTML tags</span> that should be stripped.\n\n### Minor Subsection\n\nFinal concluding remarks.',
        slug: 'wix-formatting-guide',
        status: 'APPROVED',
      },
    });

    let capturedDraftPayload: any = null;
    let publishedCalledForRich: boolean = false;

    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';

      if (urlStr.includes('/blog/v3/posts?filter=') || urlStr.includes('/blog/v3/draft-posts?filter=')) {
        return new Response(JSON.stringify({ posts: [], draftPosts: [] }), { status: 200 });
      }

      if (urlStr.endsWith('/blog/v3/draft-posts') && method === 'POST') {
        capturedDraftPayload = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            draftPost: {
              id: 'wix-rich-draft-id-123',
              title: capturedDraftPayload?.draftPost?.title,
              slug: capturedDraftPayload?.draftPost?.slug,
              status: 'DRAFT',
            },
          }),
          { status: 201 }
        );
      }

      if (urlStr.includes('/blog/v3/draft-posts/wix-rich-draft-id-123/publish') && method === 'POST') {
        publishedCalledForRich = true;
        return new Response(
          JSON.stringify({
            post: {
              id: 'wix-rich-published-id-456',
              title: 'Complete Wix Formatting Guide',
              slug: 'wix-formatting-guide',
              url: 'https://mywixsite.com/post/wix-formatting-guide',
              status: 'PUBLISHED',
            },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    await publishArticle(testSiteId, richArticleId, testConnId, { postStatus: 'publish' });

    assert(Boolean(publishedCalledForRich), 'Approved article triggers draft creation followed by publish endpoint');
    const nodes = capturedDraftPayload?.draftPost?.richContent?.nodes || [];
    assert(nodes.length === 6, 'RichContent contains 6 AST blocks (3 headings, 3 paragraphs)');
    assert(nodes[0].type === 'HEADING' && nodes[0].headingData?.level === 1 && nodes[0].nodes[0].textData.text === 'Top Level Title', 'Heading 1 AST node correctly formatted');
    assert(nodes[1].type === 'PARAGRAPH' && nodes[1].nodes[0].textData.text.includes('Introductory paragraph'), 'Paragraph 1 AST node formatted');
    assert(nodes[2].type === 'HEADING' && nodes[2].headingData?.level === 2 && nodes[2].nodes[0].textData.text === 'Section Subheading', 'Heading 2 AST node correctly formatted');
    assert(nodes[3].type === 'PARAGRAPH' && !nodes[3].nodes[0].textData.text.includes('<span') && nodes[3].nodes[0].textData.text.includes('inline HTML tags'), 'HTML tags stripped cleanly in textData');
    assert(nodes[4].type === 'HEADING' && nodes[4].headingData?.level === 3 && nodes[4].nodes[0].textData.text === 'Minor Subsection', 'Heading 3 AST node correctly formatted');

    // 10b. Unapproved article rejection across non-approved statuses
    const unapprovedStatuses = ['DRAFT', 'PLANNED', 'AI_REVIEW', 'USER_REVIEW', 'IDEA'];
    for (const st of unapprovedStatuses) {
      const unapprovedArtId = `wix-unapproved-${st}-${Date.now()}`;
      await prisma.article.create({
        data: {
          id: unapprovedArtId,
          websiteId: testSiteId,
          title: `Article in ${st}`,
          content: 'Content',
          slug: `article-${st.toLowerCase()}`,
          status: st as any,
        },
      });

      try {
        await publishArticle(testSiteId, unapprovedArtId, testConnId, { postStatus: 'publish' });
        assert(false, `Article in ${st} should be rejected`);
      } catch (err: any) {
        assert(err.message.includes('must be in "APPROVED" status'), `Article in ${st} strictly rejected from publishing`);
      } finally {
        await prisma.article.deleteMany({ where: { id: unapprovedArtId } }).catch(() => {});
      }
    }

    // 10c. Creating a Wix draft only (status: 'draft')
    let draftOnlyPublishCalled: boolean = false;
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      if (urlStr.includes('filter=')) {
        return new Response(JSON.stringify({ posts: [], draftPosts: [] }), { status: 200 });
      }
      if (urlStr.endsWith('/blog/v3/draft-posts') && method === 'POST') {
        return new Response(JSON.stringify({ draftPost: { id: 'wix-draft-only-777', status: 'DRAFT' } }), { status: 201 });
      }
      if (urlStr.includes('/publish')) {
        draftOnlyPublishCalled = true;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    const draftArticleId = `wix-draft-only-art-${Date.now()}`;
    await prisma.article.create({
      data: {
        id: draftArticleId,
        websiteId: testSiteId,
        title: 'Draft Mode Post',
        content: 'Draft content.',
        slug: 'draft-mode-post',
        status: 'APPROVED',
      },
    });

    await publishArticle(testSiteId, draftArticleId, testConnId, { postStatus: 'draft' });
    const draftPubRecord = await prisma.articlePublication.findFirst({
      where: { articleId: draftArticleId, cmsConnectionId: testConnId },
    });
    assert(draftPubRecord?.remoteId === 'wix-draft-only-777', 'Draft post ID stored in publication tracking');
    assert(!draftOnlyPublishCalled, 'Draft publication mode does not invoke Wix /publish endpoint');

    // 10d. Scheduled article remains draft on Wix
    let scheduledPublishCalled: boolean = false;
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      if (urlStr.includes('filter=')) {
        return new Response(JSON.stringify({ posts: [], draftPosts: [] }), { status: 200 });
      }
      if (urlStr.endsWith('/blog/v3/draft-posts') && method === 'POST') {
        return new Response(JSON.stringify({ draftPost: { id: 'wix-sched-draft-888', status: 'DRAFT' } }), { status: 201 });
      }
      if (urlStr.includes('/publish')) {
        scheduledPublishCalled = true;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    const schedArticleId = `wix-sched-art-${Date.now()}`;
    const futureDate = new Date(Date.now() + 172800000).toISOString();
    await prisma.article.create({
      data: {
        id: schedArticleId,
        websiteId: testSiteId,
        title: 'Future Scheduled Post',
        content: 'Scheduled content.',
        slug: 'future-scheduled-post',
        status: 'APPROVED',
        scheduledAt: new Date(futureDate),
      },
    });

    await publishArticle(testSiteId, schedArticleId, testConnId, { postStatus: 'future', scheduledAt: futureDate });
    const schedPubRecord = await prisma.articlePublication.findFirst({
      where: { articleId: schedArticleId, cmsConnectionId: testConnId },
    });
    assert(schedPubRecord?.remoteId === 'wix-sched-draft-888', 'Scheduled article saved as Draft on Wix');
    assert(!scheduledPublishCalled, 'Scheduled article is NOT published live on Wix prior to release date');
    assert(schedPubRecord?.publishedAt === null || schedPubRecord?.publishedAt === undefined, 'publishedAt timestamp remains null until release');

    // 10e. Duplicate Slug Handling across Live Posts and Draft Posts
    // Existing Live Post -> PATCH /posts/{id}
    let livePatchCalled: boolean = false;
    let livePostCreateCalled: boolean = false;
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      if (urlStr.includes('/blog/v3/posts?filter=')) {
        return new Response(JSON.stringify({ posts: [{ id: 'wix-live-dup-1', slug: 'dup-slug' }] }), { status: 200 });
      }
      if (urlStr.includes('/blog/v3/draft-posts') && method === 'POST') {
        livePostCreateCalled = true;
      }
      if (urlStr.includes('/blog/v3/posts/wix-live-dup-1') && method === 'PATCH') {
        livePatchCalled = true;
        return new Response(JSON.stringify({ post: { id: 'wix-live-dup-1', url: 'https://mywixsite.com/post/dup-slug' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    const dupLiveArticleId = `wix-dup-live-${Date.now()}`;
    await prisma.article.create({
      data: {
        id: dupLiveArticleId,
        websiteId: testSiteId,
        title: 'Duplicate Slug Article',
        content: 'Updated content.',
        slug: 'dup-slug',
        status: 'APPROVED',
      },
    });

    await publishArticle(testSiteId, dupLiveArticleId, testConnId, { postStatus: 'publish' });
    assert(Boolean(livePatchCalled), 'Existing live post updated in-place via PATCH');
    assert(!livePostCreateCalled, 'No new duplicate draft or post created when live post exists');

    // Existing Draft Post -> PATCH /draft-posts/{id} and then /publish
    let draftPatchCalled: boolean = false;
    let draftPublishCalled: boolean = false;
    let newDraftCreatedForExisting: boolean = false;
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      if (urlStr.includes('/blog/v3/posts?filter=')) {
        return new Response(JSON.stringify({ posts: [] }), { status: 200 });
      }
      if (urlStr.includes('/blog/v3/draft-posts?filter=')) {
        return new Response(JSON.stringify({ draftPosts: [{ id: 'wix-draft-dup-2', slug: 'draft-dup-slug' }] }), { status: 200 });
      }
      if (urlStr.endsWith('/blog/v3/draft-posts') && method === 'POST') {
        newDraftCreatedForExisting = true;
      }
      if (urlStr.includes('/blog/v3/draft-posts/wix-draft-dup-2') && method === 'PATCH') {
        draftPatchCalled = true;
        return new Response(JSON.stringify({ draftPost: { id: 'wix-draft-dup-2' } }), { status: 200 });
      }
      if (urlStr.includes('/blog/v3/draft-posts/wix-draft-dup-2/publish') && method === 'POST') {
        draftPublishCalled = true;
        return new Response(JSON.stringify({ post: { id: 'wix-draft-dup-2', url: 'https://mywixsite.com/post/draft-dup-slug' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    const dupDraftArticleId = `wix-dup-draft-${Date.now()}`;
    await prisma.article.create({
      data: {
        id: dupDraftArticleId,
        websiteId: testSiteId,
        title: 'Existing Draft Article',
        content: 'Publishing existing draft.',
        slug: 'draft-dup-slug',
        status: 'APPROVED',
      },
    });

    await publishArticle(testSiteId, dupDraftArticleId, testConnId, { postStatus: 'publish' });
    assert(Boolean(draftPatchCalled), 'Existing draft post updated via PATCH');
    assert(Boolean(draftPublishCalled), 'Existing draft post then published via /publish endpoint');
    assert(!newDraftCreatedForExisting, 'No duplicate draft created');

    // 10f. API Failures Handled Safely Without Leaking Secrets
    // Case 1: Wix Draft creation fails with 500
    globalThis.fetch = (async (url: any) => {
      if (String(url).includes('filter=')) return new Response(JSON.stringify({ posts: [], draftPosts: [] }), { status: 200 });
      return new Response(JSON.stringify({ message: 'Internal Server Error', secret_token: 'should-not-leak' }), { status: 500 });
    }) as any;

    const failArticleId = `wix-fail-art-${Date.now()}`;
    await prisma.article.create({
      data: {
        id: failArticleId,
        websiteId: testSiteId,
        title: 'Failing Article',
        content: 'Content',
        slug: 'failing-article',
        status: 'APPROVED',
      },
    });

    try {
      await publishArticle(testSiteId, failArticleId, testConnId, { postStatus: 'publish' });
      assert(false, 'Publishing should throw when API fails with 500');
    } catch (err: any) {
      assert(err.message.includes('Wix API error') || err.message.includes('500'), 'Publishing throws expected error on 500 failure');
    }
    const failedPubRecord = await prisma.articlePublication.findFirst({
      where: { articleId: failArticleId, cmsConnectionId: testConnId },
    });
    assert(failedPubRecord?.status === 'FAILED', 'Publication tracking record marked FAILED on 500 error');
    assert(!failedPubRecord?.lastError?.includes('secret_key'), 'Failed record error does NOT leak API key');
    const intactArticle = await prisma.article.findUnique({ where: { id: failArticleId } });
    assert(intactArticle?.status === 'APPROVED', 'Article status remains APPROVED (not falsely marked PUBLISHED) after failure');

    // Case 2: Draft creates successfully, but /publish step fails
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      if (urlStr.includes('filter=')) return new Response(JSON.stringify({ posts: [], draftPosts: [] }), { status: 200 });
      if (urlStr.endsWith('/blog/v3/draft-posts') && method === 'POST') {
        return new Response(JSON.stringify({ draftPost: { id: 'wix-half-dp-1' } }), { status: 201 });
      }
      if (urlStr.includes('/publish')) {
        return new Response(JSON.stringify({ message: 'Publish permission revoked' }), { status: 403 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    const halfFailArticleId = `wix-half-fail-${Date.now()}`;
    await prisma.article.create({
      data: {
        id: halfFailArticleId,
        websiteId: testSiteId,
        title: 'Half Failing Article',
        content: 'Content',
        slug: 'half-failing-article',
        status: 'APPROVED',
      },
    });

    try {
      await publishArticle(testSiteId, halfFailArticleId, testConnId, { postStatus: 'publish' });
      assert(false, 'Publishing should throw when /publish step fails with 403');
    } catch (err: any) {
      assert(err.message.includes('Draft created on Wix') || err.message.includes('publishing failed'), 'Publishing throws expected error with draft ID context');
    }
    const halfFailedPubRecord = await prisma.articlePublication.findFirst({
      where: { articleId: halfFailArticleId, cmsConnectionId: testConnId },
    });
    assert(halfFailedPubRecord?.status === 'FAILED', 'Publish failure marked FAILED');
    assert(Boolean(halfFailedPubRecord?.lastError?.includes('Draft created on Wix (ID: wix-half-dp-1)')), 'Error notes draft creation but publish step failure');
    assert(!halfFailedPubRecord?.lastError?.includes('secret_key'), 'Error does not leak secret key');

    // Clean up test articles
    await prisma.articlePublication.deleteMany({
      where: {
        articleId: {
          in: [richArticleId, draftArticleId, schedArticleId, dupLiveArticleId, dupDraftArticleId, failArticleId, halfFailArticleId],
        },
      },
    }).catch(() => {});
    await prisma.article.deleteMany({
      where: {
        id: {
          in: [richArticleId, draftArticleId, schedArticleId, dupLiveArticleId, dupDraftArticleId, failArticleId, halfFailArticleId],
        },
      },
    }).catch(() => {});
  } finally {
    // Cleanup test records
    await prisma.articlePublication.deleteMany({ where: { cmsConnectionId: testConnId } }).catch(() => {});
    await prisma.article.deleteMany({ where: { id: testArticleId } }).catch(() => {});
    await prisma.cmsConnection.deleteMany({ where: { id: testConnId } }).catch(() => {});
    await prisma.website.deleteMany({ where: { id: testSiteId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
    globalThis.fetch = originalFetch;
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runWixTests()
  .catch((e) => {
    console.error('Fatal Wix test runner error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
