import fs from 'fs';
import path from 'path';
import prisma from '../lib/database';

async function runSafetyGuardTests() {
  console.log('\n==================================================');
  console.log('RUNNING DATABASE SAFETY GUARD & ISOLATION TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`PASS: ${msg}`);
      passed++;
    } else {
      console.error(`FAIL: ${msg}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Test 1: prisma.user.deleteMany() without args is blocked by Safety Guard
  // ---------------------------------------------------------------------------
  try {
    await (prisma.user as any).deleteMany();
    assert(false, 'Test 1: prisma.user.deleteMany() must be blocked');
  } catch (err: any) {
    assert(
      err.message.includes('CRITICAL DATABASE SAFETY GUARD') && err.message.includes('User'),
      'Test 1: Unscoped prisma.user.deleteMany() blocked by Safety Guard'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 2: prisma.subscription.deleteMany({}) with empty object is blocked
  // ---------------------------------------------------------------------------
  try {
    await prisma.subscription.deleteMany({ where: {} });
    assert(false, 'Test 2: prisma.subscription.deleteMany({ where: {} }) must be blocked');
  } catch (err: any) {
    assert(
      err.message.includes('CRITICAL DATABASE SAFETY GUARD') && err.message.includes('Subscription'),
      'Test 2: prisma.subscription.deleteMany({ where: {} }) blocked by Safety Guard'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3: prisma.website.deleteMany() without where is blocked
  // ---------------------------------------------------------------------------
  try {
    await (prisma.website as any).deleteMany();
    assert(false, 'Test 3: prisma.website.deleteMany() must be blocked');
  } catch (err: any) {
    assert(
      err.message.includes('CRITICAL DATABASE SAFETY GUARD') && err.message.includes('Website'),
      'Test 3: Unscoped prisma.website.deleteMany() blocked by Safety Guard'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 4: prisma.article.deleteMany() without where is blocked
  // ---------------------------------------------------------------------------
  try {
    await (prisma.article as any).deleteMany();
    assert(false, 'Test 4: prisma.article.deleteMany() must be blocked');
  } catch (err: any) {
    assert(
      err.message.includes('CRITICAL DATABASE SAFETY GUARD') && err.message.includes('Article'),
      'Test 4: Unscoped prisma.article.deleteMany() blocked by Safety Guard'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 5: Scoped deleteMany with valid where condition is ALLOWED
  // ---------------------------------------------------------------------------
  try {
    const result = await prisma.user.deleteMany({
      where: { id: 'non-existent-safe-test-guard-id' },
    });
    assert(
      typeof result.count === 'number',
      'Test 5: Scoped deleteMany with specific where filter is allowed'
    );
  } catch (err: any) {
    assert(false, `Test 5: Scoped deleteMany threw unexpectedly: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 6: Static codebase audit - No test file contains unscoped deleteMany()
  // ---------------------------------------------------------------------------
  const testDir = __dirname;
  const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.ts') && f !== 'safety-guard-test.ts');
  let unscopedOccurrences: string[] = [];

  for (const file of testFiles) {
    const content = fs.readFileSync(path.join(testDir, file), 'utf8');
    // Match patterns like .deleteMany() or .deleteMany({})
    const matches = content.match(/\.deleteMany\(\s*(\{\s*\})?\s*\)/g);
    if (matches && matches.length > 0) {
      unscopedOccurrences.push(`${file}: ${matches.join(', ')}`);
    }
  }

  assert(
    unscopedOccurrences.length === 0,
    `Test 6: All ${testFiles.length} test files free of unscoped deleteMany() calls` +
      (unscopedOccurrences.length > 0 ? ` (Found: ${unscopedOccurrences.join('; ')})` : '')
  );

  // ---------------------------------------------------------------------------
  // Test 7: Verify development user records remain intact
  // ---------------------------------------------------------------------------
  const devUser = await prisma.user.findFirst({
    where: { email: 'madhanraj5002@gmail.com' },
  });
  assert(
    Boolean(devUser && devUser.email === 'madhanraj5002@gmail.com'),
    'Test 7: Real development user (madhanraj5002@gmail.com) remains preserved in database'
  );

  // ---------------------------------------------------------------------------
  // Test 8: Multiple consecutive scoped executions do not delete development user
  // ---------------------------------------------------------------------------
  const dummyScopedId = 'dummy-id-repeatable-check';
  await prisma.user.deleteMany({ where: { id: dummyScopedId } });
  await prisma.user.deleteMany({ where: { id: dummyScopedId } });

  const devUserAfter = await prisma.user.findFirst({
    where: { email: 'madhanraj5002@gmail.com' },
  });
  assert(
    Boolean(devUserAfter && devUserAfter.id === devUser?.id),
    'Test 8: Multiple test runs preserve development user identity across executions'
  );

  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
}

runSafetyGuardTests()
  .catch((err) => {
    console.error('Safety guard test runner error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
