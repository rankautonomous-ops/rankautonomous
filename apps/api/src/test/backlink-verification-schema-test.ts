import '../lib/env';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import prisma from '../lib/database';

describe('Backlink Verification Schema Tests', () => {
  let user: any;
  let website: any;
  let backlink: any;

  before(async () => {
    user = await prisma.user.create({
      data: {
        email: `verification-schema-${Date.now()}@example.com`,
        supabaseAuthId: `verification-schema-auth-${Date.now()}`
      }
    });

    website = await prisma.website.create({
      data: {
        userId: user.id,
        url: 'https://mysite.com',
        name: 'My Site'
      }
    });
  });

  after(async () => {
    if (website) {
      await prisma.website.delete({ where: { id: website.id } });
    }
    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('New backlink defaults to UNVERIFIED and linkAttributes defaults to []', async () => {
    backlink = await prisma.backlink.create({
      data: {
        websiteId: website.id,
        sourceUrl: 'https://source.com/page',
        targetUrl: 'https://mysite.com',
        referringDomain: 'source.com',
      }
    });

    assert.strictEqual(backlink.verificationStatus, 'UNVERIFIED');
    assert.deepStrictEqual(backlink.linkAttributes, []);
    assert.strictEqual(backlink.lastErrorMessage, null);
    // Legacy status remains ACTIVE
    assert.strictEqual(backlink.status, 'ACTIVE');
  });

  it('verificationStatus can become VERIFIED', async () => {
    const updated = await prisma.backlink.update({
      where: { id: backlink.id },
      data: { verificationStatus: 'VERIFIED' }
    });
    assert.strictEqual(updated.verificationStatus, 'VERIFIED');
  });

  it('verificationStatus can become MISSING', async () => {
    const updated = await prisma.backlink.update({
      where: { id: backlink.id },
      data: { verificationStatus: 'MISSING' }
    });
    assert.strictEqual(updated.verificationStatus, 'MISSING');
  });

  it('verificationStatus can become ERROR and store safe error text', async () => {
    const updated = await prisma.backlink.update({
      where: { id: backlink.id },
      data: { 
        verificationStatus: 'ERROR',
        lastErrorMessage: 'Source URL resolved to a private IP address'
      }
    });
    assert.strictEqual(updated.verificationStatus, 'ERROR');
    assert.strictEqual(updated.lastErrorMessage, 'Source URL resolved to a private IP address');
  });

  it('Multiple link attributes can coexist', async () => {
    const updated = await prisma.backlink.update({
      where: { id: backlink.id },
      data: { 
        linkAttributes: { set: ['NOFOLLOW', 'SPONSORED'] }
      }
    });
    assert.ok(updated.linkAttributes.includes('NOFOLLOW'));
    assert.ok(updated.linkAttributes.includes('SPONSORED'));
    assert.strictEqual(updated.linkAttributes.length, 2);
  });

  it('Existing status behavior remains compatible', async () => {
    const updated = await prisma.backlink.update({
      where: { id: backlink.id },
      data: { 
        status: 'LOST'
      }
    });
    assert.strictEqual(updated.status, 'LOST');
    // Verification fields should remain unaffected
    assert.strictEqual(updated.verificationStatus, 'ERROR');
  });

  it('Website relationship remains intact', async () => {
    const fetchedWebsite = await prisma.website.findUnique({
      where: { id: website.id },
      include: { backlinks: true }
    });
    assert.ok((fetchedWebsite?.backlinks?.length || 0) > 0);
    assert.strictEqual(fetchedWebsite?.backlinks[0].id, backlink.id);
  });
});
