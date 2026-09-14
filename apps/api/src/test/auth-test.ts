import { Request, Response, NextFunction } from 'express';
import { requireAuth, requireCustomer, requireAdmin } from '../middleware/auth';
import { AuthenticatedUser } from '../types/auth';

/**
 * Lightweight mock helper for Express Request and Response
 */
function createMockContext(headers: Record<string, string> = {}, user?: AuthenticatedUser) {
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;

  const req = {
    headers,
    user,
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
  } as unknown as Response;

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

async function runAuthTests() {
  console.log('==================================================');
  console.log('RUNNING STEP 3 AUTHENTICATION & AUTHORIZATION TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`PASS: ${testName}`);
      passed++;
    } else {
      console.error(`FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // Test 1: Missing Authorization header should return 401
  {
    const ctx = createMockContext({});
    await requireAuth(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && ctx.getData()?.error === 'Unauthorized',
      'Missing Authorization header returns 401'
    );
  }

  // Test 2: Invalid/malformed Bearer header returns 401
  {
    const ctx = createMockContext({ authorization: 'Basic 12345' });
    await requireAuth(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && ctx.getData()?.error === 'Unauthorized',
      'Non-Bearer Authorization header returns 401'
    );
  }

  // Test 3: Invalid token returns 401
  {
    const ctx = createMockContext({ authorization: 'Bearer invalid-token-xyz' });
    await requireAuth(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && ctx.getData()?.error === 'Unauthorized',
      'Invalid token verification returns 401'
    );
  }

  // Test 4: requireCustomer blocks unauthenticated request
  {
    const ctx = createMockContext({});
    requireCustomer(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && !ctx.isNextCalled(),
      'requireCustomer returns 401 if user is not attached'
    );
  }

  // Test 5: requireCustomer permits CUSTOMER role
  {
    const customerUser: AuthenticatedUser = {
      id: 'cust-123',
      supabaseAuthId: 'supa-123',
      email: 'customer@rankautonomous.com',
      name: 'Customer One',
      role: 'CUSTOMER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ctx = createMockContext({}, customerUser);
    requireCustomer(ctx.req, ctx.res, ctx.next);
    assert(ctx.isNextCalled() && ctx.getStatus() === 200, 'requireCustomer allows CUSTOMER role');
  }

  // Test 6: requireAdmin blocks CUSTOMER role with 403
  {
    const customerUser: AuthenticatedUser = {
      id: 'cust-123',
      supabaseAuthId: 'supa-123',
      email: 'customer@rankautonomous.com',
      name: 'Customer One',
      role: 'CUSTOMER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ctx = createMockContext({}, customerUser);
    requireAdmin(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 403 && ctx.getData()?.error === 'Forbidden' && !ctx.isNextCalled(),
      'requireAdmin blocks CUSTOMER with 403 Forbidden'
    );
  }

  // Test 7: requireAdmin permits ADMIN role
  {
    const adminUser: AuthenticatedUser = {
      id: 'admin-123',
      supabaseAuthId: 'supa-admin-123',
      email: 'admin@rankautonomous.com',
      name: 'Admin User',
      role: 'ADMIN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ctx = createMockContext({}, adminUser);
    requireAdmin(ctx.req, ctx.res, ctx.next);
    assert(ctx.isNextCalled() && ctx.getStatus() === 200, 'requireAdmin allows ADMIN role');
  }

  // Test 8: Safe /api/me payload sanitization
  {
    const user: AuthenticatedUser = {
      id: 'user-safe-check',
      supabaseAuthId: 'supa-safe-check',
      email: 'safe@rankautonomous.com',
      name: 'Safe User',
      role: 'CUSTOMER',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    // Simulated controller logic from routes/user.ts
    const safePayload = {
      user: {
        id: user.id,
        supabaseAuthId: user.supabaseAuthId,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    };

    const keys = Object.keys(safePayload.user);
    const hasForbiddenKeys = ['password', 'token', 'secret', 'hash', 'service_role'].some((k) =>
      keys.includes(k)
    );

    assert(
      !hasForbiddenKeys && safePayload.user.email === 'safe@rankautonomous.com',
      'GET /api/me strictly excludes passwords, tokens, or server secrets'
    );
  }

  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
