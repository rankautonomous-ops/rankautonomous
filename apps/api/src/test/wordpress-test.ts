import assert from 'assert';
import { Request, Response as ExpressResponse, NextFunction } from 'express';
import prisma from '../lib/database';
import websiteRouter from '../routes/website';
import { AuthenticatedUser } from '../types/auth';
import { isEncryptedEnvelope, decryptJson } from '../lib/encryption';
import { normalizeWordPressUrl } from '../services/wordpress/client';

/**
 * Mock context dispatcher for website router
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
  } as unknown as ExpressResponse;

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

async function dispatch(
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
    (websiteRouter as any).handle(ctx.req, ctx.res, () => {
      resolve();
    });
  });
  return ctx;
}

// =============================================================================
// MOCK FETCH & DNS FOR WORDPRESS REST API
// =============================================================================
import dns from 'dns';

const originalFetch = globalThis.fetch;
const originalLookup = dns.lookup;
let postCreateCount = 0;
let postUpdateCount = 0;

const mockDnsMap: Record<string, string> = {
  'my-wp-blog.com': '93.184.216.34',
  'bad-pass.com': '93.184.216.34',
  'no-perms.com': '93.184.216.34',
  'no-rest.com': '93.184.216.34',
  'wp-timeout.com': '93.184.216.34',
  'wp-500.com': '93.184.216.34',
};

function setupMockFetch() {
  postCreateCount = 0;
  postUpdateCount = 0;

  (dns as any).lookup = function (hostname: string, options: any, callback: any) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }
    if (mockDnsMap[hostname]) {
      return callback(null, mockDnsMap[hostname], 4);
    }
    return originalLookup(hostname, options, callback);
  };

  globalThis.fetch = async (input: any, init?: any): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = (init?.method || 'GET').toUpperCase();

    // 1. Connection test: GET /wp-json/wp/v2/users/me
    if (urlStr.includes('/wp-json/wp/v2/users/me')) {
      if (urlStr.includes('bad-pass.com')) {
        return new Response(JSON.stringify({ code: 'incorrect_password', message: 'The password you entered is incorrect.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('no-perms.com')) {
        return new Response(JSON.stringify({ id: 2, name: 'Subscriber', capabilities: { publish_posts: false, edit_posts: false }, roles: ['subscriber'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('no-rest.com')) {
        return new Response('<html>404 Not Found</html>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (urlStr.includes('wp-timeout.com')) {
        const error: any = new Error('The operation was aborted due to timeout');
        error.name = 'AbortError';
        throw error;
      }
      if (urlStr.includes('wp-500.com')) {
        return new Response(JSON.stringify({ code: 'internal_error', message: 'Fatal PHP error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Default success
      return new Response(
        JSON.stringify({
          id: 1,
          name: 'WP Editor',
          slug: 'wp-editor',
          capabilities: { publish_posts: true, edit_posts: true },
          roles: ['editor'],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Posts endpoint
    if (urlStr.includes('/wp-json/wp/v2/posts')) {
      if (urlStr.includes('wp-500.com')) {
        return new Response(JSON.stringify({ message: 'WordPress database error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('wp-timeout.com')) {
        const error: any = new Error('The operation was aborted due to timeout');
        error.name = 'AbortError';
        throw error;
      }

      // DELETE /wp-json/wp/v2/posts/:id
      if (method === 'DELETE') {
        return new Response(
          JSON.stringify({
            id: 808,
            status: 'trash',
            link: 'https://my-wp-blog.com/?p=808',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // POST /wp-json/wp/v2/posts/:id (Update)
      if (method === 'POST' && /\/posts\/\d+/.test(urlStr)) {
        postUpdateCount++;
        const body = init?.body ? JSON.parse(init.body) : {};
        return new Response(
          JSON.stringify({
            id: 808,
            date: new Date().toISOString(),
            date_gmt: body.date_gmt || new Date().toISOString(),
            slug: body.slug || 'test-article',
            status: body.status || 'publish',
            link: `https://my-wp-blog.com/${body.slug || 'test-article'}/`,
            title: { rendered: body.title || 'Title' },
            content: { rendered: body.content || 'Content' },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // POST /wp-json/wp/v2/posts (Create)
      if (method === 'POST') {
        postCreateCount++;
        const body = init?.body ? JSON.parse(init.body) : {};
        return new Response(
          JSON.stringify({
            id: 808,
            date: new Date().toISOString(),
            date_gmt: body.date_gmt || new Date().toISOString(),
            slug: body.slug || 'test-article',
            status: body.status || 'publish',
            link: `https://my-wp-blog.com/${body.slug || 'test-article'}/`,
            title: { rendered: body.title || 'Title' },
            content: { rendered: body.content || 'Content' },
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return originalFetch(input, init);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  (dns as any).lookup = originalLookup;
}

// =============================================================================
// RUN TESTS
// =============================================================================
async function runWordPressTests() {
  console.log('==================================================');
  console.log('RUNNING STEP 6H WORDPRESS CMS PUBLISHING TESTS');
  console.log('==================================================');

  setupMockFetch();

  const timestamp = Date.now();
  const userAId = `wp-user-a-${timestamp}`;
  const userBId = `wp-user-b-${timestamp}`;
  const userUnsubId = `wp-user-unsub-${timestamp}`;

  // Seed Users
  const userA = await prisma.user.create({
    data: { id: userAId, email: `wpa_${timestamp}@test.com`, role: 'CUSTOMER' },
  });
  const userB = await prisma.user.create({
    data: { id: userBId, email: `wpb_${timestamp}@test.com`, role: 'CUSTOMER' },
  });
  const userUnsub = await prisma.user.create({
    data: { id: userUnsubId, email: `wpunsub_${timestamp}@test.com`, role: 'CUSTOMER' },
  });

  // Seed Active Subscriptions for User A and B
  await prisma.subscription.create({
    data: {
      userId: userA.id,
      plan: 'monthly',
      interval: 'month',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
    },
  });
  await prisma.subscription.create({
    data: {
      userId: userB.id,
      plan: 'monthly',
      interval: 'month',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
    },
  });

  // Seed Websites
  const siteA = await prisma.website.create({
    data: {
      userId: userA.id,
      url: 'https://my-wp-blog.com',
      name: 'Blog A',
      status: 'ACTIVE',
    },
  });
  const siteB = await prisma.website.create({
    data: {
      userId: userB.id,
      url: 'https://site-b.com',
      name: 'Site B',
      status: 'ACTIVE',
    },
  });

  // Seed Articles on Site A
  const articleIdea = await prisma.article.create({
    data: {
      websiteId: siteA.id,
      title: 'Idea Article',
      content: 'Draft content',
      status: 'IDEA',
    },
  });

  const articleApproved = await prisma.article.create({
    data: {
      websiteId: siteA.id,
      title: 'Approved SEO Guide',
      slug: 'approved-seo-guide',
      content: '<h2>Heading 2</h2><p>This is high-value SEO content approved for publishing.</p>',
      metaDescription: 'Comprehensive guide to advanced SEO techniques in 2026.',
      status: 'APPROVED',
    },
  });

  const articleEmpty = await prisma.article.create({
    data: {
      websiteId: siteA.id,
      title: '',
      content: '',
      status: 'APPROVED',
    },
  });

  const authUserA: AuthenticatedUser = {
    id: userA.id,
    email: userA.email,
    role: userA.role,
    supabaseAuthId: userA.supabaseAuthId || 'sub_auth_a',
    name: userA.name,
    createdAt: userA.createdAt,
    updatedAt: userA.updatedAt,
  };
  const authUserB: AuthenticatedUser = {
    id: userB.id,
    email: userB.email,
    role: userB.role,
    supabaseAuthId: userB.supabaseAuthId || 'sub_auth_b',
    name: userB.name,
    createdAt: userB.createdAt,
    updatedAt: userB.updatedAt,
  };
  const authUnsub: AuthenticatedUser = {
    id: userUnsub.id,
    email: userUnsub.email,
    role: userUnsub.role,
    supabaseAuthId: userUnsub.supabaseAuthId || 'sub_auth_unsub',
    name: userUnsub.name,
    createdAt: userUnsub.createdAt,
    updatedAt: userUnsub.updatedAt,
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Unauthenticated request to connect WordPress is rejected with 401
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress`, undefined, {
        siteUrl: 'https://my-wp-blog.com',
        username: 'admin',
        applicationPassword: 'app-pass-1234',
      });
      assert.strictEqual(ctx.getStatus(), 401, 'Test 1: Must reject unauthenticated request');
      console.log('PASS: Test 1: Unauthenticated request to connect WordPress is rejected with 401');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Customer B cannot connect WordPress to Customer A's website (404)
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress`, authUserB, {
        siteUrl: 'https://my-wp-blog.com',
        username: 'admin',
        applicationPassword: 'app-pass-1234',
      });
      assert.strictEqual(ctx.getStatus(), 404, 'Test 2: Cross-tenant connection must return 404');
      console.log('PASS: Test 2: Customer B cannot connect WordPress to Customer A\'s website (tenant isolation 404)');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Missing connection parameters rejected with 400
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress`, authUserA, {
        siteUrl: 'https://my-wp-blog.com',
        // missing username and password
      });
      assert.strictEqual(ctx.getStatus(), 400, 'Test 3: Missing parameters must return 400');
      console.log('PASS: Test 3: Missing connection parameters (siteUrl, username, applicationPassword) rejected with 400');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Malformed WordPress URL rejected with 400
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress`, authUserA, {
        siteUrl: '://invalid-uri',
        username: 'admin',
        applicationPassword: 'app-pass-1234',
      });
      assert.strictEqual(ctx.getStatus(), 400, 'Test 4: Malformed URL must return 400');
      console.log('PASS: Test 4: Malformed WordPress URL rejected with 400');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Private IP / SSRF WordPress URL rejected with 400
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress`, authUserA, {
        siteUrl: 'http://127.0.0.1:8000',
        username: 'admin',
        applicationPassword: 'app-pass-1234',
      });
      assert.strictEqual(ctx.getStatus(), 400, 'Test 5: Private IP / SSRF must return 400');
      console.log('PASS: Test 5: Private IP / SSRF WordPress URL rejected with 400');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Successful connection test returns user details and canPublish: true
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress/test`, authUserA, {
        siteUrl: 'https://my-wp-blog.com',
        username: 'admin',
        applicationPassword: 'app-pass-1234',
      });
      assert.strictEqual(ctx.getStatus(), 200, 'Test 6: Status must be 200');
      const data = ctx.getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.canPublish, true);
      assert.strictEqual(data.user?.name, 'WP Editor');
      console.log('PASS: Test 6: Successful connection test returns user details and canPublish: true');
    }

    // -------------------------------------------------------------------------
    // TEST 7: Connection test with invalid credentials returns 401
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress/test`, authUserA, {
        siteUrl: 'https://bad-pass.com',
        username: 'admin',
        applicationPassword: 'wrong-password',
      });
      assert.strictEqual(ctx.getStatus(), 401, 'Test 7: Wrong password must return 401');
      console.log('PASS: Test 7: Connection test with invalid credentials returns 401');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Connection test for user lacking publish capability returns 403
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress`, authUserA, {
        siteUrl: 'https://no-perms.com',
        username: 'subscriber',
        applicationPassword: 'app-pass-1234',
      });
      assert.strictEqual(ctx.getStatus(), 403, 'Test 8: Insufficient permissions must return 403');
      console.log('PASS: Test 8: Connection test for user lacking publish capability returns 403');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Connection test when REST API is missing/disabled returns 404
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress/test`, authUserA, {
        siteUrl: 'https://no-rest.com',
        username: 'admin',
        applicationPassword: 'app-pass-1234',
      });
      assert.strictEqual(ctx.getStatus(), 404, 'Test 9: Missing REST endpoint must return 404');
      console.log('PASS: Test 9: Connection test when REST API is missing/disabled returns 404');
    }

    // -------------------------------------------------------------------------
    // TEST 10: Saving WordPress integration validates connection and stores encrypted credentials
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/integrations/wordpress`, authUserA, {
        siteUrl: 'https://my-wp-blog.com',
        username: 'admin',
        applicationPassword: 'valid-secret-password-123',
      });
      assert.strictEqual(ctx.getStatus(), 200, 'Test 10: Saving integration must return 200');
      const data = ctx.getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.integration?.provider, 'WORDPRESS');
      assert.strictEqual(data.integration?.config?.siteUrl, 'https://my-wp-blog.com');
      console.log('PASS: Test 10: Saving WordPress integration validates connection and stores encrypted credentials');
    }

    // -------------------------------------------------------------------------
    // TEST 11: GET /api/websites/:id/integrations/wordpress strictly omits sensitive credentials
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('GET', `/${siteA.id}/integrations/wordpress`, authUserA);
      assert.strictEqual(ctx.getStatus(), 200, 'Test 11: Status must be 200');
      const data = ctx.getData();
      assert.strictEqual(data.connected, true);
      assert.strictEqual(data.integration?.config?.siteUrl, 'https://my-wp-blog.com');
      assert.strictEqual(data.integration?.credentials, undefined, 'Test 11: Credentials must never be returned');
      const serialized = JSON.stringify(data);
      assert(!serialized.includes('valid-secret-password-123'), 'Test 11: Password must never appear in response payload');
      console.log('PASS: Test 11: GET /api/websites/:id/integrations/wordpress strictly omits sensitive credentials');
    }

    // -------------------------------------------------------------------------
    // TEST 12: Credentials in database are encrypted with AES-256-GCM and never stored in plaintext
    // -------------------------------------------------------------------------
    {
      const dbRecord = await prisma.integration.findUnique({
        where: {
          websiteId_provider: { websiteId: siteA.id, provider: 'WORDPRESS' },
        },
      });
      assert(dbRecord, 'Test 12: Integration record must exist in database');
      assert(dbRecord.credentials, 'Test 12: Credentials field must exist');
      assert(!dbRecord.credentials.includes('valid-secret-password-123'), 'Test 12: Plaintext password must not exist in DB');
      assert(isEncryptedEnvelope(dbRecord.credentials), 'Test 12: Ciphertext must be in iv:authTag:cipher format');

      const decrypted = decryptJson<any>(dbRecord.credentials);
      assert.strictEqual(decrypted.applicationPassword, 'valid-secret-password-123', 'Test 12: Decrypted value matches');
      console.log('PASS: Test 12: Credentials in database are encrypted with AES-256-GCM and never stored in plaintext');
    }

    // -------------------------------------------------------------------------
    // TEST 13: DELETE /api/websites/:id/integrations/wordpress cleanly deletes the integration
    // -------------------------------------------------------------------------
    {
      // First create integration on site B to test deletion
      await dispatch('POST', `/${siteB.id}/integrations/wordpress`, authUserB, {
        siteUrl: 'https://my-wp-blog.com',
        username: 'admin',
        applicationPassword: 'secret-pass-b',
      });
      const deleteCtx = await dispatch('DELETE', `/${siteB.id}/integrations/wordpress`, authUserB);
      assert.strictEqual(deleteCtx.getStatus(), 200, 'Test 13: Delete must return 200');

      const checkCtx = await dispatch('GET', `/${siteB.id}/integrations/wordpress`, authUserB);
      assert.strictEqual(checkCtx.getData()?.connected, false, 'Test 13: Should report disconnected');
      console.log('PASS: Test 13: DELETE /api/websites/:id/integrations/wordpress cleanly deletes the integration');
    }

    // -------------------------------------------------------------------------
    // TEST 14: Publishing article with status IDEA or DRAFT is rejected with 400
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${articleIdea.id}/publish`, authUserA);
      assert.strictEqual(ctx.getStatus(), 400, 'Test 14: Non-approved article publishing must return 400');
      assert(ctx.getData()?.message?.includes('APPROVED'), 'Test 14: Must instruct article to be APPROVED');
      console.log('PASS: Test 14: Publishing article with status IDEA or DRAFT is rejected with 400');
    }

    // -------------------------------------------------------------------------
    // TEST 15: Unsubscribed customer cannot publish article (403 SUBSCRIPTION_REQUIRED)
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${articleApproved.id}/publish`, authUnsub);
      assert.strictEqual(ctx.getStatus(), 403, 'Test 15: Unsubscribed customer must return 403');
      assert.strictEqual(ctx.getData()?.code, 'SUBSCRIPTION_REQUIRED');
      console.log('PASS: Test 15: Unsubscribed customer cannot publish article (403 SUBSCRIPTION_REQUIRED)');
    }

    // -------------------------------------------------------------------------
    // TEST 16: Customer B cannot publish Customer A's article (tenant isolation 404)
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${articleApproved.id}/publish`, authUserB);
      assert.strictEqual(ctx.getStatus(), 404, 'Test 16: Cross-tenant publish must return 404');
      console.log('PASS: Test 16: Customer B cannot publish Customer A\'s article (tenant isolation 404)');
    }

    // -------------------------------------------------------------------------
    // TEST 17: Publishing article without title or content is rejected with 400
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${articleEmpty.id}/publish`, authUserA);
      assert.strictEqual(ctx.getStatus(), 400, 'Test 17: Empty article publish must return 400');
      console.log('PASS: Test 17: Publishing article without title or content is rejected with 400');
    }

    // -------------------------------------------------------------------------
    // TEST 18: Live publish creates WordPress post and marks article PUBLISHED
    // -------------------------------------------------------------------------
    {
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${articleApproved.id}/publish`, authUserA);
      assert.strictEqual(ctx.getStatus(), 200, 'Test 18: Live publish must return 200');
      const data = ctx.getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.article?.status, 'PUBLISHED');
      assert.strictEqual(data.publicationInfo?.postId, 808);
      assert(data.publicationInfo?.postUrl?.includes('approved-seo-guide'));
      console.log('PASS: Test 18: Live publish creates WordPress post and marks article PUBLISHED');
    }

    // -------------------------------------------------------------------------
    // TEST 19: Draft publish creates WordPress post with status draft
    // -------------------------------------------------------------------------
    {
      const draftArticle = await prisma.article.create({
        data: {
          websiteId: siteA.id,
          title: 'Draft SEO Article',
          content: '<p>Content for draft test</p>',
          status: 'APPROVED',
        },
      });
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${draftArticle.id}/publish`, authUserA, {
        postStatus: 'draft',
      });
      assert.strictEqual(ctx.getStatus(), 200, 'Test 19: Draft publish must return 200');
      const data = ctx.getData();
      assert.strictEqual(data.publicationInfo?.status, 'draft');
      console.log('PASS: Test 19: Draft publish creates WordPress post with status draft');
    }

    // -------------------------------------------------------------------------
    // TEST 20: Scheduled publish validates future scheduledAt and transmits date_gmt
    // -------------------------------------------------------------------------
    {
      const schedArticle = await prisma.article.create({
        data: {
          websiteId: siteA.id,
          title: 'Scheduled Article',
          content: '<p>Future content</p>',
          status: 'APPROVED',
        },
      });
      const futureDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${schedArticle.id}/publish`, authUserA, {
        scheduledAt: futureDate,
      });
      assert.strictEqual(ctx.getStatus(), 200, 'Test 20: Scheduled publish must return 200');
      const data = ctx.getData();
      assert.strictEqual(data.publicationInfo?.status, 'future');
      console.log('PASS: Test 20: Scheduled publish validates future scheduledAt and transmits date_gmt');
    }

    // -------------------------------------------------------------------------
    // TEST 21: Article cmsPublicationInfo accurately persists postId, postUrl, provider, and timestamps
    // -------------------------------------------------------------------------
    {
      const articleInDb = await prisma.article.findUnique({
        where: { id: articleApproved.id },
      });
      assert(articleInDb, 'Test 21: Article must exist in DB');
      assert.strictEqual(articleInDb.status, 'PUBLISHED');
      assert(articleInDb.publishedAt !== null, 'Test 21: publishedAt must be set');
      const pubInfo = articleInDb.cmsPublicationInfo as any;
      assert.strictEqual(pubInfo.provider, 'WORDPRESS');
      assert.strictEqual(pubInfo.postId, 808);
      assert.strictEqual(pubInfo.siteUrl, 'https://my-wp-blog.com');
      assert(pubInfo.publishedAt, 'Test 21: publishedAt timestamp must exist in publication info');
      console.log('PASS: Test 21: Article cmsPublicationInfo accurately persists postId, postUrl, provider, and timestamps');
    }

    // -------------------------------------------------------------------------
    // TEST 22: Idempotent re-publishing of already published article updates existing post without creating duplicate
    // -------------------------------------------------------------------------
    {
      const currentCreateCount = postCreateCount;
      const currentUpdateCount = postUpdateCount;

      // Call publish again on the already-published article
      const ctx = await dispatch('POST', `/${siteA.id}/articles/${articleApproved.id}/publish`, authUserA);
      assert.strictEqual(ctx.getStatus(), 200, 'Test 22: Re-publish must return 200');
      assert.strictEqual(postCreateCount, currentCreateCount, 'Test 22: Re-publish must NOT call create post');
      assert.strictEqual(postUpdateCount, currentUpdateCount + 1, 'Test 22: Re-publish MUST call update post');
      console.log('PASS: Test 22: Idempotent re-publishing of already published article updates existing post without creating duplicate');
    }

    // -------------------------------------------------------------------------
    // TEST 23: WordPress 500 error leaves article in APPROVED status and returns actionable error
    // -------------------------------------------------------------------------
    {
      // Switch site integration to 500 site
      await prisma.integration.update({
        where: { websiteId_provider: { websiteId: siteA.id, provider: 'WORDPRESS' } },
        data: { config: { siteUrl: 'https://wp-500.com', username: 'admin' } },
      });

      const errArticle = await prisma.article.create({
        data: {
          websiteId: siteA.id,
          title: 'Error Article',
          content: '<p>Content</p>',
          status: 'APPROVED',
        },
      });

      const ctx = await dispatch('POST', `/${siteA.id}/articles/${errArticle.id}/publish`, authUserA);
      assert(ctx.getStatus() >= 500, 'Test 23: Server error must return 5xx');

      const rechecked = await prisma.article.findUnique({ where: { id: errArticle.id } });
      assert.strictEqual(rechecked?.status, 'APPROVED', 'Test 23: Article status must remain APPROVED upon failure');
      console.log('PASS: Test 23: WordPress 500 error leaves article in APPROVED status and returns actionable error');
    }

    // -------------------------------------------------------------------------
    // TEST 24: WordPress timeout (exceeded timeoutMs) aborts safely with 504
    // -------------------------------------------------------------------------
    {
      await prisma.integration.update({
        where: { websiteId_provider: { websiteId: siteA.id, provider: 'WORDPRESS' } },
        data: { config: { siteUrl: 'https://wp-timeout.com', username: 'admin' } },
      });

      const timeoutArticle = await prisma.article.create({
        data: {
          websiteId: siteA.id,
          title: 'Timeout Article',
          content: '<p>Content</p>',
          status: 'APPROVED',
        },
      });

      const ctx = await dispatch('POST', `/${siteA.id}/articles/${timeoutArticle.id}/publish`, authUserA);
      assert.strictEqual(ctx.getStatus(), 504, 'Test 24: Timeout must return 504 Gateway Timeout');
      console.log('PASS: Test 24: WordPress timeout (exceeded timeoutMs) aborts safely with 504');
    }

    // -------------------------------------------------------------------------
    // TEST 25: Trashing published post calls WordPress delete and updates cmsPublicationInfo status to trash
    // -------------------------------------------------------------------------
    {
      // Reset integration back to working site
      await prisma.integration.update({
        where: { websiteId_provider: { websiteId: siteA.id, provider: 'WORDPRESS' } },
        data: { config: { siteUrl: 'https://my-wp-blog.com', username: 'admin' } },
      });

      const ctx = await dispatch('DELETE', `/${siteA.id}/articles/${articleApproved.id}/publish`, authUserA);
      assert.strictEqual(ctx.getStatus(), 200, 'Test 25: Trash post must return 200');
      const data = ctx.getData();
      assert.strictEqual(data.publicationInfo?.status, 'trash');

      const inDb = await prisma.article.findUnique({ where: { id: articleApproved.id } });
      assert.strictEqual((inDb?.cmsPublicationInfo as any)?.status, 'trash');
      console.log('PASS: Test 25: Trashing published post calls WordPress delete and updates cmsPublicationInfo status to trash');
    }

    console.log('\n==================================================');
    console.log('SUMMARY: All 25 WordPress Integration & Publishing Tests Passed!');
    console.log('==================================================\n');
  } finally {
    restoreFetch();
    // Cleanup seed records
    await prisma.article.deleteMany({ where: { websiteId: { in: [siteA.id, siteB.id] } } });
    await prisma.integration.deleteMany({ where: { websiteId: { in: [siteA.id, siteB.id] } } });
    await prisma.website.deleteMany({ where: { id: { in: [siteA.id, siteB.id] } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: [userAId, userBId, userUnsubId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId, userUnsubId] } } });
    await prisma.$disconnect();
  }
}

runWordPressTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
