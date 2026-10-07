import { createCmsProvider } from '../services/cms/factory';
import { publishArticle } from '../services/cms/publishingService';
import { PrismaClient } from '@prisma/client';
import { decryptJson, encryptJson } from '../lib/encryption';
import { ssrfSafeFetch } from '../lib/urlSafety';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Running CMS Adapter Tests ---');
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

  // 1. Adapter Registry
  try {
    const wpProvider = createCmsProvider({
      id: 'test',
      websiteId: 'test',
      provider: 'WORDPRESS',
      name: 'Test WP',
      status: 'CONNECTED',
      baseUrl: 'http://example.com',
      credentials: encryptJson({ username: 'user', applicationPassword: 'password' }),
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      lastTestedAt: null,
      lastError: null
    } as any);
    assert(wpProvider.constructor.name === 'WordPressCmsProvider', 'Registry maps WORDPRESS to WordPressCmsProvider');

    const hookProvider = createCmsProvider({ provider: 'WEBHOOK', baseUrl: 'http://example.com', metadata: {} } as any);
    assert(hookProvider.constructor.name === 'CustomCmsProvider', 'Registry maps WEBHOOK to CustomCmsProvider');

    const notionProvider = createCmsProvider({ provider: 'NOTION', credentials: encryptJson({ integrationToken: '123' }), metadata: { databaseId: 'abc' } } as any);
    assert(notionProvider.constructor.name === 'NotionProvider', 'Registry maps NOTION to NotionProvider');

  } catch (e: any) {
    console.error(e);
    failed++;
  }

  // 2. Unsupported Provider fake success check
  try {
    const comingSoon = createCmsProvider({ provider: 'WIX' } as any);
    await comingSoon.testConnection();
    assert(false, 'Unsupported provider should throw on testConnection');
  } catch (e: any) {
    assert(e.message.includes('coming soon'), 'Unsupported provider test connection fails safely');
  }

  try {
    const comingSoon = createCmsProvider({ provider: 'WIX' } as any);
    const pubResult = await comingSoon.publishArticle({ title: '', content: '', status: 'publish' });
    assert(pubResult.status === 'FAILED', 'Unsupported provider publish fails safely');
  } catch (e: any) {
    failed++;
  }

  // 11, 12. Credential encryption/redaction is handled by existing encryptJson, let's verify
  const secret = { token: 'supersecret123' };
  const encrypted = encryptJson(secret);
  assert(!encrypted.includes('supersecret123'), 'Encryption hides secret token');
  const decrypted = decryptJson<any>(encrypted);
  assert(decrypted.token === 'supersecret123', 'Decryption restores secret token');

  // SSRF protection is used in CustomCmsProvider
  try {
    const custom = createCmsProvider({ provider: 'WEBHOOK', baseUrl: 'http://169.254.169.254/metadata', metadata: {} } as any);
    await custom.testConnection();
    assert(false, 'SSRF vulnerable IP did not block');
  } catch (e: any) {
    assert(e.message.includes('SSRF') || e.message.includes('Private IPs are not allowed'), 'SSRF protection for WEBHOOK endpoint works');
  }

  // Ghost Provider
  try {
    const ghost = createCmsProvider({ provider: 'GHOST', baseUrl: 'https://example.com', credentials: encryptJson({ adminApiKey: 'invalid_format' }) } as any);
    await ghost.testConnection();
    assert(false, 'Ghost provider should fail on invalid key format');
  } catch (e: any) {
    assert(e.message.includes('Invalid Ghost Admin API key format') || e.message.includes('Expected id:secret'), 'Ghost provider validates API key format');
  }

  // RSS Provider
  try {
    const rss = createCmsProvider({ provider: 'RSS', metadata: {} } as any);
    const pub = await rss.publishArticle({ title: 'test', content: 'test', status: 'publish' });
    assert(pub.status === 'PUBLISHED', 'RSS adapter successfully returns PUBLISHED');
  } catch (e: any) {
    failed++;
  }

  // Shopify Adapter behavior
  try {
    const shopify = createCmsProvider({ provider: 'SHOPIFY', baseUrl: 'https://test.myshopify.com', credentials: encryptJson({ accessToken: 'test' }), metadata: { blogId: '123' } } as any);
    assert(shopify.constructor.name === 'ShopifyCmsProvider', 'Shopify adapter initializes correctly');
  } catch (e: any) {
    failed++;
  }

  // Webflow Adapter behavior
  try {
    const webflow = createCmsProvider({ provider: 'WEBFLOW', credentials: encryptJson({ accessToken: 'test' }), metadata: { siteId: '123', collectionId: 'abc' } } as any);
    assert(webflow.constructor.name === 'WebflowCmsProvider', 'Webflow adapter initializes correctly');
  } catch (e: any) {
    failed++;
  }

  // Next.js Adapter behavior
  try {
    const nextjs = createCmsProvider({ provider: 'NEXTJS', baseUrl: 'https://example.com/api/webhook', credentials: encryptJson({ token: 'test' }), metadata: { authMethod: 'BEARER' } } as any);
    assert(nextjs.constructor.name === 'CustomCmsProvider', 'Next.js adapter uses CustomCmsProvider');
  } catch (e: any) {
    failed++;
  }

  console.log(`\nTests finished: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(console.error).finally(() => prisma.$disconnect());
