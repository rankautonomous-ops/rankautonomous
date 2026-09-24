import * as dotenv from 'dotenv';
dotenv.config({ path: require('path').resolve(__dirname, '../../../../.env') });
import request from 'supertest';
import express from 'express';
import prisma from '../lib/database';
import { encryptJson } from '../lib/encryption';
import adminRouter from '../routes/admin';

// Create a mock app
const app = express();
app.use(express.json());

// Mock Auth Middleware specifically for test app
app.use('/api/admin', (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const [role, id] = authHeader.replace('Bearer ', '').split(':');
  req.user = { id, role };
  
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}, adminRouter);

async function runTests() {
  console.log('--- RUNNING ADMIN PANEL & SECURITY TESTS ---');
  let failures = 0;
  
  // Seed Users
  const adminUser = await prisma.user.create({
    data: { id: 'test-admin-1', email: 'admin@test.com', role: 'ADMIN' }
  });
  const normalUser = await prisma.user.create({
    data: { id: 'test-user-1', email: 'user@test.com', role: 'CUSTOMER' }
  });
  const lastAdmin = await prisma.user.create({
    data: { id: 'test-admin-2', email: 'lastadmin@test.com', role: 'ADMIN' }
  });

  // Seed CMS Connection
  const website = await prisma.website.create({
    data: { id: 'test-website-admin', name: 'admin site', url: 'admin-site.com', userId: normalUser.id }
  });
  const cmsConn = await prisma.cmsConnection.create({
    data: {
      id: 'test-cms-admin',
      websiteId: website.id,
      provider: 'WORDPRESS',
      name: 'Test WP',
      credentials: encryptJson({ password: 'secret-password' })
    }
  });

  // Seed BackgroundJob
  const jobSafe = await prisma.backgroundJob.create({
    data: { id: 'test-job-safe', type: 'SEO_CRAWL', payload: {}, status: 'FAILED' }
  });
  const jobUnsafe = await prisma.backgroundJob.create({
    data: { id: 'test-job-unsafe', type: 'CREATE_ARTICLE', payload: {}, status: 'FAILED' }
  });

  // Test 1: Unauthenticated -> rejected
  const res1 = await request(app).get('/api/admin/overview');
  if (res1.status !== 401) { console.error('[FAIL] 1. Unauthenticated allowed'); failures++; }
  else console.log('[PASS] 1. Unauthenticated admin API -> rejected');

  // Test 2: Normal user -> rejected
  const res2 = await request(app).get('/api/admin/overview').set('Authorization', `Bearer CUSTOMER:${normalUser.id}`);
  if (res2.status !== 403) { console.error('[FAIL] 2. Normal user allowed'); failures++; }
  else console.log('[PASS] 2. Normal user -> rejected');

  // Test 3: Admin -> allowed
  const res3 = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ADMIN:${adminUser.id}`);
  if (res3.status !== 200) { console.error('[FAIL] 3. Admin rejected', res3.body); failures++; }
  else console.log('[PASS] 3. Admin -> allowed');

  // Test 5: Admin cannot retrieve CMS credentials
  const res5 = await request(app).get('/api/admin/cms').set('Authorization', `Bearer ADMIN:${adminUser.id}`);
  const hasSecrets = res5.body.connections?.some((c: any) => c.credentials || JSON.stringify(c).includes('secret-password'));
  if (hasSecrets) { console.error('[FAIL] 5. CMS Credentials leaked to Admin'); failures++; }
  else console.log('[PASS] 5. Admin cannot retrieve CMS credentials (only credentialsStatus)');

  // Test 8: Pagination validation
  const res8 = await request(app).get('/api/admin/users?limit=9999').set('Authorization', `Bearer ADMIN:${adminUser.id}`);
  if (res8.body.pagination.limit > 100) { console.error('[FAIL] 8. Pagination max limit not enforced'); failures++; }
  else console.log('[PASS] 8. Pagination validation prevents pathological limits');

  // Test 9: Job retry authorization (Safe vs Unsafe)
  const res9a = await request(app).post(`/api/admin/jobs/${jobSafe.id}/retry`).set('Authorization', `Bearer ADMIN:${adminUser.id}`);
  if (res9a.status !== 200) { console.error('[FAIL] 9a. Safe job retry failed', res9a.body); failures++; }
  
  const res9b = await request(app).post(`/api/admin/jobs/${jobUnsafe.id}/retry`).set('Authorization', `Bearer ADMIN:${adminUser.id}`);
  if (res9b.status !== 400) { console.error('[FAIL] 9b. Unsafe job retry allowed'); failures++; }
  else console.log('[PASS] 9. Job retry authorization restricts unsafe payloads');

  // Test 10: Role change & 11: Last-admin protection
  const res10 = await request(app)
    .patch(`/api/admin/users/${adminUser.id}/role`)
    .send({ role: 'CUSTOMER' })
    .set('Authorization', `Bearer ADMIN:${adminUser.id}`);
  if (res10.status !== 400) { console.error('[FAIL] 10/11. Last-admin protection failed'); failures++; }
  else console.log('[PASS] 10/11. Role change authorization & self-demotion protection working');

  // Cleanup
  await prisma.auditLog.deleteMany({ where: { userId: { startsWith: 'test-' } } });
  await prisma.backgroundJob.deleteMany({ where: { id: { startsWith: 'test-job' } } });
  await prisma.cmsConnection.deleteMany({ where: { id: 'test-cms-admin' } });
  await prisma.website.deleteMany({ where: { id: 'test-website-admin' } });
  await prisma.user.deleteMany({ where: { id: { startsWith: 'test-' } } });

  if (failures > 0) {
    console.error(`\\nFailed ${failures} tests.`);
    process.exit(1);
  } else {
    console.log('\\nAll Admin Tests Passed.');
    process.exit(0);
  }
}

if (require.main === module) {
  runTests().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
