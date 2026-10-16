import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { createCmsProvider } from '../services/cms/factory';
import { publishArticle } from '../services/cms/publishingService';
import { PrismaClient } from '@prisma/client';
import { decryptJson, encryptJson } from '../lib/encryption';
import { WixProvider } from '../services/cms/providers/WixProvider';
import { SquarespaceProvider } from '../services/cms/providers/SquarespaceProvider';
import { BigCommerceProvider } from '../services/cms/providers/BigCommerceProvider';
import { DudaProvider } from '../services/cms/providers/DudaProvider';
import { HubSpotProvider } from '../services/cms/providers/HubSpotProvider';
import { HighLevelProvider } from '../services/cms/providers/HighLevelProvider';
import { FramerProvider } from '../services/cms/providers/FramerProvider';
import { LovableProvider } from '../services/cms/providers/LovableProvider';
import { WebflowCmsProvider } from '../services/cms/providers/WebflowProvider';
import { NotionProvider } from '../services/cms/providers/NotionProvider';
import { WordPressClient } from '../services/wordpress/client';
import dns from 'dns';

const prisma = new PrismaClient();

async function main() {
  console.log('====================================================');
  console.log('       CMS ADAPTERS TEST SUITE (18 TARGETS)         ');
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

  // ================================================================
  // 1. FACTORY REGISTRATION - ALL 18 PLATFORMS
  // ================================================================
  console.log('\n--- 1. Factory Provider Resolution (18 Platforms) ---');

  const targets = [
    { provider: 'WORDPRESS', expected: 'WordPressCmsProvider', creds: { username: 'u', applicationPassword: 'p' }, base: 'https://wp.org' },
    { provider: 'WORDPRESS_COM', expected: 'WordPressCmsProvider', creds: { username: 'u', applicationPassword: 'p' }, base: 'https://wp.com' },
    { provider: 'SHOPIFY', expected: 'ShopifyCmsProvider', creds: { accessToken: 'tok' }, base: 'https://shop.myshopify.com', meta: { blogId: '123' } },
    { provider: 'WEBFLOW', expected: 'WebflowCmsProvider', creds: { accessToken: 'tok' }, meta: { siteId: '1', collectionId: '2' } },
    { provider: 'GHOST', expected: 'GhostProvider', creds: { adminApiKey: '64a:1234567890abcdef' }, base: 'https://ghost.org' },
    { provider: 'NOTION', expected: 'NotionProvider', creds: { integrationToken: 'tok' }, meta: { databaseId: 'db' } },
    { provider: 'RSS', expected: 'RssProvider' },
    { provider: 'WEBHOOK', expected: 'CustomCmsProvider', base: 'https://example.com/webhook' },
    { provider: 'NEXTJS', expected: 'CustomCmsProvider', base: 'https://example.com/api/post' },
    { provider: 'CUSTOM', expected: 'CustomCmsProvider', base: 'https://example.com/api' },
    { provider: 'WIX', expected: 'WixProvider', creds: { apiKey: 'key', siteId: 'site1' } },
    { provider: 'SQUARESPACE', expected: 'SquarespaceProvider', base: 'https://example.com/sqs-webhook' },
    { provider: 'BIGCOMMERCE', expected: 'BigCommerceProvider', creds: { accessToken: 'bc-tok', storeHash: 'hash1' } },
    { provider: 'DUDA', expected: 'DudaProvider', creds: { username: 'u', password: 'p', siteName: 'duda-site' } },
    { provider: 'HUBSPOT', expected: 'HubSpotProvider', creds: { accessToken: 'hs-pat' } },
    { provider: 'HIGHLEVEL', expected: 'HighLevelProvider', creds: { accessToken: 'ghl-key', locationId: 'loc1' } },
    { provider: 'FRAMER', expected: 'FramerProvider', base: 'https://example.com/framer-sync' },
    { provider: 'LOVABLE', expected: 'LovableProvider', base: 'https://example.com/lovable-app' },
  ];

  for (const t of targets) {
    try {
      const conn: any = {
        id: `test-${t.provider.toLowerCase()}`,
        provider: t.provider,
        name: `Test ${t.provider}`,
        baseUrl: t.base || null,
        credentials: t.creds ? encryptJson(t.creds) : null,
        metadata: t.meta || {},
      };
      const p = createCmsProvider(conn);
      assert(p.constructor.name === t.expected, `Target ${t.provider} resolved to ${t.expected}`);
    } catch (e: any) {
      console.error(`Error resolving ${t.provider}:`, e);
      assert(false, `Target ${t.provider} threw during creation: ${e.message}`);
    }
  }

  // ================================================================
  // 2. CONFIGURATION VALIDATION & REQUIRED CREDENTIALS ENFORCEMENT
  // ================================================================
  console.log('\n--- 2. Credential & Configuration Validation ---');

  // Wix validation
  try {
    new WixProvider('', {});
    assert(false, 'Wix should fail without API key');
  } catch (e: any) {
    assert(e.message.includes('Missing Wix API Key'), 'Wix requires API Key');
  }
  try {
    new WixProvider('', { apiKey: 'key' }, {});
    assert(false, 'Wix should fail without Site ID');
  } catch (e: any) {
    assert(e.message.includes('Missing Wix Site ID'), 'Wix requires Site ID');
  }

  // Squarespace validation
  try {
    new SquarespaceProvider('', {});
    assert(false, 'Squarespace should fail without webhook endpoint');
  } catch (e: any) {
    assert(e.message.includes('requires a webhook'), 'Squarespace requires webhook endpoint');
  }

  // BigCommerce validation
  try {
    new BigCommerceProvider('', {});
    assert(false, 'BigCommerce should fail without access token');
  } catch (e: any) {
    assert(e.message.includes('Missing BigCommerce API Access Token'), 'BigCommerce requires access token');
  }
  try {
    new BigCommerceProvider('', { accessToken: 'tok' });
    assert(false, 'BigCommerce should fail without store hash');
  } catch (e: any) {
    assert(e.message.includes('Missing BigCommerce Store Hash'), 'BigCommerce requires store hash');
  }

  // Duda validation
  try {
    new DudaProvider('', {});
    assert(false, 'Duda should fail without credentials');
  } catch (e: any) {
    assert(e.message.includes('Missing Duda API Username or Password'), 'Duda requires username/password');
  }
  try {
    new DudaProvider('', { username: 'u', password: 'p' }, {});
    assert(false, 'Duda should fail without site name');
  } catch (e: any) {
    assert(e.message.includes('Missing Duda Site Name'), 'Duda requires site name');
  }

  // HubSpot validation
  try {
    new HubSpotProvider('', {});
    assert(false, 'HubSpot should fail without access token');
  } catch (e: any) {
    assert(e.message.includes('Missing HubSpot Private App Access Token'), 'HubSpot requires Private App Token');
  }

  // HighLevel validation
  try {
    new HighLevelProvider('', {});
    assert(false, 'HighLevel should fail without access token');
  } catch (e: any) {
    assert(e.message.includes('Missing HighLevel API Key'), 'HighLevel requires API Key');
  }
  try {
    new HighLevelProvider('', { accessToken: 'tok' });
    assert(false, 'HighLevel should fail without locationId');
  } catch (e: any) {
    assert(e.message.includes('Missing HighLevel Location ID'), 'HighLevel requires Location ID');
  }

  // Framer validation
  try {
    new FramerProvider('', {});
    assert(false, 'Framer should fail without endpoint');
  } catch (e: any) {
    assert(e.message.includes('requires a CMS sync endpoint'), 'Framer requires sync endpoint');
  }

  // Lovable validation
  try {
    new LovableProvider('', {});
    assert(false, 'Lovable should fail without endpoint');
  } catch (e: any) {
    assert(e.message.includes('requires an application API route'), 'Lovable requires endpoint');
  }

  // Ghost validation
  try {
    const ghost = createCmsProvider({
      provider: 'GHOST',
      baseUrl: 'https://example.com',
      credentials: encryptJson({ adminApiKey: 'invalid_format' }),
    } as any);
    await ghost.testConnection();
    assert(false, 'Ghost provider should fail on invalid key format');
  } catch (e: any) {
    assert(e.message.includes('Invalid Ghost Admin API key format') || e.message.includes('Expected id:secret'), 'Ghost validates id:secret format');
  }

  // ================================================================
  // 3. MOCKED REQUESTS & ADAPTER WORKFLOW TESTS
  // ================================================================
  console.log('\n--- 3. Mocked Publishing & Duplicate Prevention ---');

  const originalFetch = globalThis.fetch;

  try {
    // 3a. Wix Publishing & Draft handling
    let lastWixReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastWixReq = { url: String(url), init };
      if (String(url).includes('/publish') && init?.method === 'POST') {
        return new Response(JSON.stringify({ post: { id: 'wix-post-1', url: 'https://wix.com/post/my-post' } }), { status: 200 });
      }
      if (String(url).includes('/blog/v3/posts') && init?.method === 'POST') {
        return new Response(JSON.stringify({ post: { id: 'wix-post-1', url: 'https://wix.com/post/my-post' } }), { status: 200 });
      }
      if (String(url).includes('/blog/v3/draft-posts')) {
        return new Response(JSON.stringify({ draftPost: { id: 'wix-draft-1' } }), { status: 200 });
      }
      if (String(url).includes('/blog/v3/posts') && init?.method === 'GET') {
        return new Response(JSON.stringify({ posts: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    const wix = new WixProvider('https://mywixsite.com', { apiKey: 'wix-key' }, { siteId: 'wix-site-123' });
    
    // Published
    const wixPubResult = await wix.publishArticle({
      title: 'Wix SEO Guide',
      content: '<p>Content</p>',
      slug: 'wix-seo-guide',
      status: 'publish',
    });
    assert(wixPubResult.status === 'PUBLISHED' && wixPubResult.remoteId === 'wix-post-1', 'Wix publishes live post successfully');
    assert(lastWixReq?.init?.headers?.['wix-site-id'] === 'wix-site-123', 'Wix sends wix-site-id header');

    // Draft
    const wixDraftResult = await wix.publishArticle({
      title: 'Wix Draft Guide',
      content: '<p>Draft</p>',
      slug: 'wix-draft-guide',
      status: 'draft',
    });
    assert(wixDraftResult.status === 'PUBLISHED' && wixDraftResult.remoteId === 'wix-draft-1', 'Wix supports draft publishing');

    // 3b. Squarespace Webhook / Automation Bridge
    let lastSqsReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastSqsReq = { url: String(url), init };
      return new Response(JSON.stringify({ remoteId: 'sqs-auto-1', remoteUrl: 'https://squarespace.com/blog/my-slug' }), { status: 200 });
    }) as any;

    const sqs = new SquarespaceProvider('https://example.com/sqs-webhook', { secretToken: 'sqs-secret-123' });
    const sqsResult = await sqs.publishArticle({
      title: 'Squarespace Article',
      content: '<p>Body</p>',
      slug: 'squarespace-article',
      status: 'publish',
    });
    assert(sqsResult.status === 'PUBLISHED' && sqsResult.remoteId === 'sqs-auto-1', 'Squarespace bridge dispatches published article');
    assert(!!lastSqsReq?.init?.headers?.['X-Squarespace-Bridge-Signature'], 'Squarespace includes HMAC signature header');

    // 3c. BigCommerce V2 Blog Publishing
    let lastBcReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastBcReq = { url: String(url), init };
      if (init?.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 987, preview_url: 'https://store.mybigcommerce.com/blog/post' }), { status: 200 });
    }) as any;

    const bc = new BigCommerceProvider('', { accessToken: 'bc-tok', clientId: 'bc-client' }, { storeHash: 'hash99' });
    const bcResult = await bc.publishArticle({
      title: 'Ecommerce SEO Tips',
      content: '<p>Ecommerce content</p>',
      slug: 'ecommerce-seo-tips',
      status: 'publish',
    });
    assert(bcResult.status === 'PUBLISHED' && bcResult.remoteId === '987', 'BigCommerce publishes article via V2 REST API');
    assert(lastBcReq?.init?.headers?.['X-Auth-Token'] === 'bc-tok', 'BigCommerce sends X-Auth-Token');
    assert(lastBcReq?.init?.headers?.['X-Auth-Client'] === 'bc-client', 'BigCommerce sends X-Auth-Client');

    // 3d. Duda Basic Auth & Publishing
    let lastDudaReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastDudaReq = { url: String(url), init };
      if (init?.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'duda-post-55', post_url: 'https://duda.co/blog/post-url' }), { status: 200 });
    }) as any;

    const duda = new DudaProvider('', { username: 'duda-user', password: 'duda-password' }, { siteName: 'client-site' });
    const dudaResult = await duda.publishArticle({
      title: 'Local SEO with Duda',
      content: '<p>Duda content</p>',
      slug: 'local-seo-duda',
      status: 'draft',
    });
    assert(dudaResult.status === 'PUBLISHED' && dudaResult.remoteId === 'duda-post-55', 'Duda publishes article with draft state');
    const expectedDudaAuth = `Basic ${Buffer.from('duda-user:duda-password').toString('base64')}`;
    assert(lastDudaReq?.init?.headers?.['Authorization'] === expectedDudaAuth, 'Duda formats HTTP Basic Authorization correctly');

    // 3e. HubSpot CMS Blog Posts v3
    let lastHsReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastHsReq = { url: String(url), init };
      if (init?.method === 'GET') {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'hs-12345', url: 'https://hubspot.com/blog/hs-article' }), { status: 200 });
    }) as any;

    const hs = new HubSpotProvider('', { accessToken: 'pat-hubspot-token' }, { contentGroupId: 'blog-group-7' });
    const hsResult = await hs.publishArticle({
      title: 'Inbound Growth with AI',
      content: '<p>HubSpot article</p>',
      slug: 'inbound-growth-ai',
      status: 'publish',
    });
    assert(hsResult.status === 'PUBLISHED' && hsResult.remoteId === 'hs-12345', 'HubSpot publishes article to CMS Blog Posts v3');
    assert(lastHsReq?.init?.headers?.['Authorization'] === 'Bearer pat-hubspot-token', 'HubSpot authenticates via Private App Token Bearer');

    // 3f. HighLevel (LeadConnector) V2 Blog API
    let lastGhlReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastGhlReq = { url: String(url), init };
      if (init?.method === 'GET') {
        return new Response(JSON.stringify({ posts: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ _id: 'ghl-post-99', url: 'https://highlevel.com/blog/post' }), { status: 200 });
    }) as any;

    const ghl = new HighLevelProvider('', { accessToken: 'ghl-token-xyz' }, { locationId: 'loc-highlevel-44' });
    const ghlResult = await ghl.publishArticle({
      title: 'HighLevel Marketing Automation',
      content: '<p>Content</p>',
      slug: 'highlevel-marketing',
      status: 'publish',
    });
    assert(ghlResult.status === 'PUBLISHED' && ghlResult.remoteId === 'ghl-post-99', 'HighLevel publishes article via V2 Blog API');
    assert(lastGhlReq?.init?.headers?.['Version'] === '2021-07-28', 'HighLevel sends Version 2021-07-28 header');

    // 3g. Framer CMS Sync Bridge
    let lastFramerReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastFramerReq = { url: String(url), init };
      return new Response(JSON.stringify({ remoteId: 'framer-item-123', remoteUrl: 'https://framer.site/blog/article' }), { status: 200 });
    }) as any;

    const framer = new FramerProvider('https://example.com/framer-sync', { accessToken: 'framer-sec' }, { collectionName: 'Insights' });
    const framerResult = await framer.publishArticle({
      title: 'Design-Driven SEO',
      content: '<p>Framer content</p>',
      slug: 'design-driven-seo',
      status: 'publish',
    });
    assert(framerResult.status === 'PUBLISHED' && framerResult.remoteId === 'framer-item-123', 'Framer sync bridge dispatches article');
    assert(!!lastFramerReq?.init?.headers?.['X-Framer-Bridge-Signature'], 'Framer includes HMAC signature');

    // 3h. Lovable App Endpoint
    let lastLovableReq: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      lastLovableReq = { url: String(url), init };
      return new Response(JSON.stringify({ remoteId: 'lovable-res-1', remoteUrl: 'https://my-lovable-app.com/blog/post' }), { status: 200 });
    }) as any;

    const lovable = new LovableProvider('https://example.com/api/lovable-posts', { secretToken: 'lovable-sec-key' });
    const lovableResult = await lovable.publishArticle({
      title: 'Autonomous Apps with Lovable',
      content: '<p>Body</p>',
      slug: 'autonomous-apps-lovable',
      status: 'publish',
    });
    assert(lovableResult.status === 'PUBLISHED' && lovableResult.remoteId === 'lovable-res-1', 'Lovable connector dispatches article');
    assert(!!lastLovableReq?.init?.headers?.['X-Lovable-Signature'], 'Lovable includes HMAC signature header');

    // 3i. RSS Provider
    const rss = createCmsProvider({ provider: 'RSS', metadata: {} } as any);
    const rssResult = await rss.publishArticle({ title: 'RSS Title', content: 'RSS Body', status: 'publish' });
    assert(rssResult.status === 'PUBLISHED', 'RSS feed provider generates autonomous feed');

    // 3j. Webflow Duplicate Slug Prevention & Collision Resolution
    let webflowReqs: any[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const u = String(url);
      webflowReqs.push({ url: u, init });

      // GET /items (slug pre-check)
      if (init?.method === 'GET' && u.includes('/collections/col-wf-1/items')) {
        return new Response(JSON.stringify({
          items: [
            { id: 'wf-existing-item-1', fieldData: { name: 'Existing Post', slug: 'duplicate-webflow-post' } }
          ],
          pagination: { total: 1 }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // PATCH /items/:id (update existing)
      if (init?.method === 'PATCH' && u.includes('/collections/col-wf-1/items/wf-existing-item-1')) {
        return new Response(JSON.stringify({ id: 'wf-existing-item-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // POST /items/publish
      if (init?.method === 'POST' && u.includes('/items/publish')) {
        return new Response(JSON.stringify({ published: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ id: 'wf-new-item-99' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const wf = new WebflowCmsProvider({ accessToken: 'wf-tok-123' }, { siteId: 'site-wf-1', collectionId: 'col-wf-1' });
    const wfResult = await wf.publishArticle({
      title: 'Updated SEO Post',
      content: '<p>Updated content</p>',
      slug: 'duplicate-webflow-post',
      status: 'publish',
    });
    assert(wfResult.status === 'PUBLISHED' && wfResult.remoteId === 'wf-existing-item-1', 'Webflow detects duplicate slug in collection and updates existing item');

    // 3k. Notion Configurable Database Properties & Article-Body Block Synchronization
    const capturedNotionActions: any = {
      pagesCreated: [] as any[],
      pagesUpdated: [] as any[],
      blocksDeleted: [] as string[],
      blocksAppended: [] as any[],
    };

    const mockNotionClient: any = {
      databases: {
        retrieve: async () => ({
          id: 'db-custom-1',
          properties: {
            'Custom Title': { type: 'title' },
            'Article Status': { type: 'status' },
            'Article Slug': { type: 'rich_text' },
          }
        }),
      },
      pages: {
        create: async (args: any) => {
          capturedNotionActions.pagesCreated.push(args);
          return { id: 'notion-page-999', url: 'https://notion.so/notion-page-999' };
        },
        update: async (args: any) => {
          capturedNotionActions.pagesUpdated.push(args);
          return { id: args.page_id, url: `https://notion.so/${args.page_id}` };
        },
      },
      blocks: {
        children: {
          list: async () => ({
            results: [{ id: 'old-block-1' }, { id: 'old-block-2' }]
          }),
          append: async (args: any) => {
            capturedNotionActions.blocksAppended.push(args);
            return { results: [] };
          },
        },
        delete: async (args: any) => {
          capturedNotionActions.blocksDeleted.push(args.block_id);
          return {};
        },
      },
    };

    const notion = new NotionProvider(
      { integrationToken: 'notion-secret-token' },
      { 
        databaseId: 'db-custom-1',
        titleProperty: 'Custom Title',
        statusProperty: 'Article Status',
        slugProperty: 'Article Slug',
      }
    );
    // Inject mock Notion client
    (notion as any).notion = mockNotionClient;

    const notionCreateRes = await notion.publishArticle({
      title: 'Notion Architecture',
      content: '# Heading 1\n## Heading 2\n- Bullet item\n1. Numbered item\nParagraph text.',
      slug: 'notion-architecture',
      status: 'publish',
    });
    assert(notionCreateRes.status === 'PUBLISHED' && notionCreateRes.remoteId === 'notion-page-999', 'Notion creates page with custom properties');
    const createdProps = capturedNotionActions.pagesCreated[0]?.properties;
    assert(!!createdProps?.['Custom Title']?.title, 'Notion maps title to custom "Custom Title" column');
    assert(createdProps?.['Article Status']?.status?.name === 'Published', 'Notion maps status to custom "Article Status" status column');
    assert(createdProps?.['Article Slug']?.rich_text?.[0]?.text?.content === 'notion-architecture', 'Notion maps slug to custom "Article Slug" column');

    // Test Notion Update & Article-Body Synchronization
    const notionUpdateRes = await notion.updateArticle('notion-page-999', {
      title: 'Updated Notion Architecture',
      content: '# New Heading\nUpdated paragraph block.',
      status: 'publish',
    });
    assert(notionUpdateRes.status === 'PUBLISHED' && notionUpdateRes.remoteId === 'notion-page-999', 'Notion updates existing page');
    assert(capturedNotionActions.blocksDeleted.includes('old-block-1') && capturedNotionActions.blocksDeleted.includes('old-block-2'), 'Notion synchronizes article body by deleting obsolete blocks');
    assert(capturedNotionActions.blocksAppended.length > 0 && capturedNotionActions.blocksAppended[0]?.children?.length >= 2, 'Notion appends converted markdown blocks to page body');

    // 3l. WordPress.com Plan Requirement Guidance on 401 & 403 Errors
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes('myblog.wordpress.com')) {
        return new Response(JSON.stringify({
          code: 'rest_cannot_access',
          message: 'Sorry, you are not allowed to access this resource.',
          data: { status: 401 }
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as any;

    const wpComClient = new WordPressClient('https://myblog.wordpress.com', {
      username: 'client_wp',
      applicationPassword: 'abcd efgh ijkl mnop'
    });

    try {
      await wpComClient.testConnection();
      assert(false, 'WordPress.com should reject 401 connection');
    } catch (err: any) {
      assert(err.message.includes('Creator or Business plan'), 'WordPress.com 401 error explicitly guides user about Creator or Business plan requirement');
    }

  } finally {
    globalThis.fetch = originalFetch;
  }

  // ================================================================
  // 4. SECURITY & SAFEGUARDS VERIFICATION
  // ================================================================
  console.log('\n--- 4. Security & Safeguard Verification ---');

  // Encryption
  const secretCreds = { apiKey: 'live_pat_super_secret_99999' };
  const encrypted = encryptJson(secretCreds);
  assert(!encrypted.includes('live_pat_super_secret_99999'), 'AES-256-GCM securely encrypts credentials');
  const decrypted = decryptJson<any>(encrypted);
  assert(decrypted.apiKey === 'live_pat_super_secret_99999', 'Decryption cleanly restores original secret');

  // SSRF Protection
  try {
    const custom = createCmsProvider({ provider: 'WEBHOOK', baseUrl: 'http://169.254.169.254/metadata', metadata: {} } as any);
    await custom.testConnection();
    assert(false, 'SSRF vulnerable IP was not blocked');
  } catch (e: any) {
    assert(e.message.includes('SSRF') || e.message.includes('Private IPs are not allowed') || e.message.includes('private/local'), 'SSRF protection blocks cloud metadata IP');
  }

  // Article Approval Safeguard in publishingService
  // Let's create a temporary draft article in the DB and verify publishing throws an error if status !== APPROVED
  const testUserId = `test-user-cms-${Date.now()}`;
  const testWebId = `test-web-cms-${Date.now()}`;
  const testArtId = `test-art-cms-${Date.now()}`;
  const testConnId = `test-conn-cms-${Date.now()}`;

  try {
    await prisma.user.create({
      data: { id: testUserId, email: `${testUserId}@example.com`, name: 'Test CMS User' }
    });
    await prisma.website.create({
      data: { id: testWebId, userId: testUserId, name: 'Test Website', url: `https://${testWebId}.com` }
    });
    const cmsConn = await prisma.cmsConnection.create({
      data: {
        id: testConnId,
        websiteId: testWebId,
        provider: 'RSS',
        name: 'Test RSS Conn',
        status: 'CONNECTED',
      }
    });

    // Case A: Article is still in DRAFT status -> MUST BE REJECTED
    await prisma.article.create({
      data: {
        id: testArtId,
        websiteId: testWebId,
        title: 'Unapproved Draft Article',
        content: 'This draft should never publish without approval.',
        status: 'DRAFT',
      }
    });

    try {
      await publishArticle(testWebId, testArtId, testConnId);
      assert(false, 'Unapproved draft article must NOT be published externally');
    } catch (err: any) {
      assert(err.message.includes('Cannot publish article with status') && err.message.includes('APPROVED'), 'Article approval safeguard strictly blocks unapproved DRAFT articles');
    }

    // Case B: Article is APPROVED -> Publishing is allowed!
    await prisma.article.update({
      where: { id: testArtId },
      data: { status: 'APPROVED' }
    });

    const pubResult = await publishArticle(testWebId, testArtId, testConnId);
    assert(pubResult.status === 'PUBLISHED', 'Approved article publishes successfully and records publication');

    // Verify ArticlePublication record
    const pubRecord = await prisma.articlePublication.findUnique({
      where: { articleId_cmsConnectionId: { articleId: testArtId, cmsConnectionId: testConnId } }
    });
    assert(!!pubRecord && pubRecord.status === 'PUBLISHED', 'Publication tracking record saved with duplicate prevention');

  } finally {
    // Cleanup
    await prisma.articlePublication.deleteMany({ where: { articleId: testArtId } }).catch(() => {});
    await prisma.article.deleteMany({ where: { id: testArtId } }).catch(() => {});
    await prisma.cmsConnection.deleteMany({ where: { id: testConnId } }).catch(() => {});
    await prisma.website.deleteMany({ where: { id: testWebId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
