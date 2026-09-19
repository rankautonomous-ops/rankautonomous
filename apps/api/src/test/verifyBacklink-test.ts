import '../lib/env';
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import prisma from '../lib/database';
import * as backlinkFetcher from '../services/backlinks/backlinkFetcher';
import { verifyBacklink, normalizeUrlForComparison } from '../services/backlinks/verifyBacklink';

describe('verifyBacklink URL Normalization', () => {
  it('Should normalize URLs correctly ignoring protocol and trailing slashes', () => {
    assert.strictEqual(
      normalizeUrlForComparison('http://example.com/page/'),
      'https://example.com/page'
    );
    assert.strictEqual(
      normalizeUrlForComparison('https://example.com/page'),
      'https://example.com/page'
    );
  });

  it('Should remove hash fragments', () => {
    assert.strictEqual(
      normalizeUrlForComparison('https://example.com/page#section'),
      'https://example.com/page'
    );
  });

  it('Should strip UTM parameters but preserve other queries', () => {
    assert.strictEqual(
      normalizeUrlForComparison('https://example.com/page?utm_source=google&utm_medium=cpc&sort=asc'),
      'https://example.com/page?sort=asc'
    );
  });
});

describe('verifyBacklink Core Service', () => {
  let user: any;
  let website: any;
  let backlink: any;
  let fetchMock: any;

  before(async () => {
    user = await prisma.user.create({
      data: {
        email: `verifybacklink-${Date.now()}@example.com`,
        supabaseAuthId: `verifybacklink-auth-${Date.now()}`
      }
    });

    website = await prisma.website.create({
      data: {
        userId: user.id,
        url: 'https://mysite.com',
        name: 'My Site'
      }
    });

    // We will override fetchSafely to mock network responses
    fetchMock = mock.method(backlinkFetcher, 'fetchSafely', async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body>Mock Data</body></html>',
        redirectCount: 0
      };
    });
  });

  after(async () => {
    fetchMock.mock.restore();
    if (website) await prisma.website.delete({ where: { id: website.id } });
    if (user) await prisma.user.delete({ where: { id: user.id } });
  });

  beforeEach(async () => {
    backlink = await prisma.backlink.create({
      data: {
        websiteId: website.id,
        sourceUrl: 'https://source.com/post',
        targetUrl: 'https://mysite.com/article',
        referringDomain: 'source.com',
      }
    });
  });

  it('Marks VERIFIED with correct linkAttributes when link is found', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body><a href="http://mysite.com/article/" rel="nofollow sponsored">Link</a></body></html>',
        redirectCount: 0
      };
    });

    await verifyBacklink(backlink.id);

    const updated = await prisma.backlink.findUnique({ where: { id: backlink.id } });
    assert.strictEqual(updated?.verificationStatus, 'VERIFIED');
    assert.ok(updated?.linkAttributes.includes('NOFOLLOW'));
    assert.ok(updated?.linkAttributes.includes('SPONSORED'));
    assert.strictEqual(updated?.lastErrorMessage, null);
    assert.ok(updated?.lastChecked !== null);
  });

  it('Marks VERIFIED with NOFOLLOW if meta robots says nofollow even if link lacks rel', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><head><meta name="robots" content="noindex, nofollow"></head><body><a href="https://mysite.com/article">Link</a></body></html>',
        redirectCount: 0
      };
    });

    await verifyBacklink(backlink.id);

    const updated = await prisma.backlink.findUnique({ where: { id: backlink.id } });
    assert.strictEqual(updated?.verificationStatus, 'VERIFIED');
    assert.ok(updated?.linkAttributes.includes('PAGE_META_NOFOLLOW'));
  });

  it('Marks MISSING when link is not found', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body><a href="https://othersite.com">Other</a></body></html>',
        redirectCount: 0
      };
    });

    await verifyBacklink(backlink.id);

    const updated = await prisma.backlink.findUnique({ where: { id: backlink.id } });
    assert.strictEqual(updated?.verificationStatus, 'MISSING');
  });

  it('Resolves relative links successfully if base url is the finalUrl', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      // Fetching source.com/post which has relative link
      // Wait, we are looking for mysite.com/article. If it is relative, it points to source.com
      // This test is to ensure we don\'t crash on relative links, and they don\'t falsely match
      return {
        success: true,
        finalUrl: url, // https://source.com/post
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body><a href="/article">Rel Link</a></body></html>',
        redirectCount: 0
      };
    });

    await verifyBacklink(backlink.id);

    const updated = await prisma.backlink.findUnique({ where: { id: backlink.id } });
    assert.strictEqual(updated?.verificationStatus, 'MISSING');
  });

  it('Marks MISSING for 404/410 failures since the page is gone', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 404,
        contentType: 'text/html',
        body: 'Not Found',
        redirectCount: 0
      };
    });

    await verifyBacklink(backlink.id);

    const updated = await prisma.backlink.findUnique({ where: { id: backlink.id } });
    assert.strictEqual(updated?.verificationStatus, 'MISSING');
    assert.strictEqual(updated?.lastErrorMessage, null);
  });

  it('Marks ERROR for SSRF blocks', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: false,
        finalUrl: url,
        errorCode: 'SSRF_BLOCKED',
        errorMessage: 'Localhost blocked',
        redirectCount: 0
      };
    });

    await verifyBacklink(backlink.id);

    const updated = await prisma.backlink.findUnique({ where: { id: backlink.id } });
    assert.strictEqual(updated?.verificationStatus, 'ERROR');
    assert.strictEqual(updated?.lastErrorMessage, 'Localhost blocked');
  });

  it('Throws error for transient HTTP errors like 502 to trigger backoff', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 502,
        contentType: 'text/html',
        body: 'Bad Gateway',
        redirectCount: 0
      };
    });

    await assert.rejects(
      async () => await verifyBacklink(backlink.id),
      (err: Error) => err.message.includes('Transient HTTP error: 502')
    );
  });

  it('Throws error for transient network timeouts to trigger backoff', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: false,
        finalUrl: url,
        errorCode: 'TIMEOUT',
        errorMessage: 'Request timed out',
        redirectCount: 0
      };
    });

    await assert.rejects(
      async () => await verifyBacklink(backlink.id),
      (err: Error) => err.message.includes('Transient fetch error: TIMEOUT')
    );
  });

  it('Marks ERROR for non-HTML content type', async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: 'application/pdf',
        body: '...',
        redirectCount: 0
      };
    });

    await verifyBacklink(backlink.id);

    const updated = await prisma.backlink.findUnique({ where: { id: backlink.id } });
    assert.strictEqual(updated?.verificationStatus, 'ERROR');
    assert.ok(updated?.lastErrorMessage?.includes('Invalid Content-Type: application/pdf'));
  });
});
