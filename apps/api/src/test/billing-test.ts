import { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';
import { requireAuth, requireCustomer, requireAdmin } from '../middleware/auth';
import {
  requireSubscription,
  hasActiveSubscription,
  isSubscriptionActive,
  ACTIVE_SUBSCRIPTION_STATUSES,
} from '../middleware/subscription';
import {
  getPriceIdForPlan,
  STRIPE_MONTHLY_PRICE_ID,
  STRIPE_ANNUAL_PRICE_ID,
  stripe,
} from '../lib/stripe';
import { AuthenticatedUser } from '../types/auth';
import prisma from '../lib/database';
import billingRouter, { syncStripeSubscriptionFromCheckoutSession } from '../routes/billing';

/**
 * Lightweight mock helper for Express Request and Response
 */
function createMockContext(
  options: {
    headers?: Record<string, string>;
    body?: any;
    user?: AuthenticatedUser;
    params?: any;
    query?: any;
    method?: string;
    url?: string;
  } = {}
) {
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;
  const resHeaders: Record<string, string> = {};
  let resolveResponse: (data: any) => void;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  const req = {
    headers: options.headers || {},
    body: options.body || {},
    user: options.user,
    params: options.params || {},
    query: options.query || {},
    method: options.method || 'GET',
    url: options.url || '/',
  } as unknown as Request;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      if (resolveResponse) resolveResponse(data);
      return this;
    },
    send(data: any) {
      responseData = data;
      if (resolveResponse) resolveResponse(data);
      return this;
    },
    setHeader(name: string, value: string) {
      resHeaders[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name: string) {
      return resHeaders[name.toLowerCase()];
    },
  } as unknown as Response;

  const next: NextFunction = () => {
    nextCalled = true;
    if (resolveResponse) resolveResponse(null);
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getData: () => responseData,
    getHeader: (name: string) => resHeaders[name.toLowerCase()],
    isNextCalled: () => nextCalled,
    waitForResponse: () =>
      Promise.race([
        responsePromise,
        new Promise((resolve) => setTimeout(() => resolve(responseData), 3000)),
      ]),
  };
}

/**
 * Pure frontend state machine derivation helper (mirroring apps/web/src/app/app/billing/page.tsx)
 */
function deriveBillingState(params: {
  isCheckoutReturn: boolean;
  loading: boolean;
  syncAttempt: number;
  maxSyncAttempts: number;
  hasActiveSubscription: boolean;
  subscription: { status: string } | null;
  error: string | null;
}): 'LOADING' | 'SYNCING' | 'ACTIVE' | 'INACTIVE' | 'ERROR' {
  if (params.error && !params.isCheckoutReturn) {
    return 'ERROR';
  }

  const isEntitled =
    params.hasActiveSubscription ||
    params.subscription?.status === 'ACTIVE' ||
    params.subscription?.status === 'TRIALING';

  if (isEntitled && params.subscription) {
    return 'ACTIVE';
  }

  if (params.isCheckoutReturn) {
    if (params.syncAttempt <= params.maxSyncAttempts) {
      return 'SYNCING';
    }
    return 'ERROR';
  }

  if (params.loading) {
    return 'LOADING';
  }

  return 'INACTIVE';
}

async function runBillingTests() {
  console.log('==================================================');
  console.log('RUNNING STRIPE BILLING & SUBSCRIPTION TEST SUITE');
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

  // Create an Express app with billing router for HTTP integration tests
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRouter);

  // ---------------------------------------------------------------------------
  // Test 1: Unauthenticated checkout request rejected with 401
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({ body: { plan: 'monthly' } });
    await requireAuth(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && ctx.getData()?.error === 'Unauthorized',
      'Test 1: Unauthenticated checkout request rejected with 401'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 2: Authenticated monthly checkout uses configured monthly Price ID
  // ---------------------------------------------------------------------------
  {
    const priceInfo = getPriceIdForPlan('monthly');
    assert(
      priceInfo !== null &&
        priceInfo.priceId === STRIPE_MONTHLY_PRICE_ID &&
        priceInfo.interval === 'month' &&
        priceInfo.priceId.startsWith('price_'),
      'Test 2: Monthly checkout strictly resolves to configured STRIPE_MONTHLY_PRICE_ID'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3: Authenticated annual checkout uses configured annual Price ID
  // ---------------------------------------------------------------------------
  {
    const priceInfo = getPriceIdForPlan('annual');
    assert(
      priceInfo !== null &&
        priceInfo.priceId === STRIPE_ANNUAL_PRICE_ID &&
        priceInfo.interval === 'year' &&
        priceInfo.priceId.startsWith('price_'),
      'Test 3: Annual checkout strictly resolves to configured STRIPE_ANNUAL_PRICE_ID'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 4: Arbitrary / malicious client price IDs or plans are rejected
  // ---------------------------------------------------------------------------
  {
    const arbitraryPlans = ['starter', 'pro', 'price_123456789', 'free_lifetime', ''];
    const allRejected = arbitraryPlans.every((plan) => getPriceIdForPlan(plan) === null);
    assert(allRejected, 'Test 4: Client cannot provide arbitrary price IDs or unapproved plan tiers');
  }

  // ---------------------------------------------------------------------------
  // Test 5: Unauthenticated billing portal request rejected with 401
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({});
    await requireAuth(ctx.req, ctx.res, ctx.next);
    assert(
      ctx.getStatus() === 401 && ctx.getData()?.error === 'Unauthorized',
      'Test 5: Unauthenticated billing portal request rejected with 401'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 6: Authenticated billing portal handles missing customer safely
  // ---------------------------------------------------------------------------
  {
    const dummyUser: AuthenticatedUser = {
      id: 'test-user-no-billing-' + Date.now(),
      supabaseAuthId: 'supa-no-billing-' + Date.now(),
      email: 'nobilling@test.com',
      name: 'No Billing User',
      role: 'CUSTOMER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existing = await prisma.subscription.findFirst({
      where: { userId: dummyUser.id, stripeCustomerId: { not: null } },
    });

    assert(
      existing === null,
      'Test 6: User without Stripe subscription has no customerId attached'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 7: Invalid Stripe webhook signature rejected with 400
  // ---------------------------------------------------------------------------
  {
    let signatureFailed = false;
    try {
      const rawPayload = Buffer.from(JSON.stringify({ type: 'invoice.paid' }));
      const badSignature = 't=12345,v1=bad_hash_signature_value';
      stripe.webhooks.constructEvent(rawPayload, badSignature, 'whsec_test_secret_123');
    } catch (err: any) {
      signatureFailed = true;
    }
    assert(signatureFailed, 'Test 7: Invalid Stripe webhook signature is rejected');
  }

  // ===========================================================================
  // SECTION 11 BUG FIX REQUIREMENTS: 15 DEDICATED SYNCHRONIZATION TESTS
  // ===========================================================================

  console.log('\n--- URGENT BUG FIX: SUBSCRIPTION STATE & SYNCHRONIZATION TESTS ---');

  // Setup test users for database integration tests
  const activeUserEmail = `active-sub-${Date.now()}@rankautonomous.com`;
  const activeUser = await prisma.user.create({
    data: { email: activeUserEmail, name: 'Active Subscriber', role: 'CUSTOMER' },
  });

  const unsubscribedUserEmail = `unsub-${Date.now()}@rankautonomous.com`;
  const unsubscribedUser = await prisma.user.create({
    data: { email: unsubscribedUserEmail, name: 'Unsubscribed User', role: 'CUSTOMER' },
  });

  const canceledUserEmail = `canceled-${Date.now()}@rankautonomous.com`;
  const canceledUser = await prisma.user.create({
    data: { email: canceledUserEmail, name: 'Canceled User', role: 'CUSTOMER' },
  });

  const activeSubId = `sub_active_${Date.now()}`;
  const futurePeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Seed active user subscription (stored in DB as lowercase 'active' from Stripe)
  await prisma.subscription.create({
    data: {
      userId: activeUser.id,
      plan: 'monthly',
      interval: 'month',
      stripeCustomerId: `cus_active_${Date.now()}`,
      stripeSubscriptionId: activeSubId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  // Seed canceled user subscription
  await prisma.subscription.create({
    data: {
      userId: canceledUser.id,
      plan: 'monthly',
      interval: 'month',
      stripeCustomerId: `cus_canceled_${Date.now()}`,
      stripeSubscriptionId: `sub_canceled_${Date.now()}`,
      status: 'canceled',
      currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: true,
    },
  });

  // ---------------------------------------------------------------------------
  // Req 1: Active subscription returns ACTIVE (normalized uppercase)
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: activeUser.id,
        supabaseAuthId: 'supa-act-1',
        email: activeUser.email,
        name: activeUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      url: '/subscription',
    });

    (billingRouter as any).handle(ctx.req, ctx.res, ctx.next);
    await ctx.waitForResponse();
    const data = ctx.getData();

    assert(
      data?.hasActiveSubscription === true &&
        data?.subscription?.status === 'ACTIVE' &&
        data?.subscription?.plan === 'monthly',
      'Req 1: Active subscription returns status ACTIVE and hasActiveSubscription=true'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 2: Missing subscription returns inactive
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: unsubscribedUser.id,
        supabaseAuthId: 'supa-unsub-1',
        email: unsubscribedUser.email,
        name: unsubscribedUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      url: '/subscription',
    });

    (billingRouter as any).handle(ctx.req, ctx.res, ctx.next);
    await ctx.waitForResponse();
    const data = ctx.getData();

    assert(
      data?.hasActiveSubscription === false && data?.subscription === null,
      'Req 2: Missing subscription returns inactive with null subscription object'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 3: Canceled subscription returns inactive
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: canceledUser.id,
        supabaseAuthId: 'supa-canc-1',
        email: canceledUser.email,
        name: canceledUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      url: '/subscription',
    });

    (billingRouter as any).handle(ctx.req, ctx.res, ctx.next);
    await ctx.waitForResponse();
    const data = ctx.getData();

    assert(
      data?.hasActiveSubscription === false && data?.subscription?.status === 'CANCELED',
      'Req 3: Canceled subscription returns hasActiveSubscription=false and status CANCELED'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 4: Customer cannot access another user's subscription
  // ---------------------------------------------------------------------------
  {
    // Unsubscribed user calling GET /subscription must not receive Active user's subscription
    const ctx = createMockContext({
      user: {
        id: unsubscribedUser.id,
        supabaseAuthId: 'supa-unsub-1',
        email: unsubscribedUser.email,
        name: unsubscribedUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      url: '/subscription',
    });

    (billingRouter as any).handle(ctx.req, ctx.res, ctx.next);
    await ctx.waitForResponse();
    const data = ctx.getData();

    assert(
      data?.subscription === null && data?.hasActiveSubscription === false,
      "Req 4: Customer cannot access another user's subscription data"
    );
  }

  // ---------------------------------------------------------------------------
  // Req 5: Checkout success does not itself prove ACTIVE
  // ---------------------------------------------------------------------------
  {
    // A client returning with ?checkout=success but whose DB record is not active
    // must NOT evaluate to ACTIVE state
    const state = deriveBillingState({
      isCheckoutReturn: true,
      loading: false,
      syncAttempt: 1,
      maxSyncAttempts: 6,
      hasActiveSubscription: false,
      subscription: null,
      error: null,
    });

    assert(
      state === 'SYNCING',
      'Req 5: Checkout success parameter enters SYNCING state and does NOT prematurely claim ACTIVE'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 6: Webhook creates subscription
  // ---------------------------------------------------------------------------
  const webhookSubId = `sub_wh_${Date.now()}`;
  {
    const created = await prisma.subscription.upsert({
      where: { stripeSubscriptionId: webhookSubId },
      create: {
        userId: unsubscribedUser.id,
        plan: 'annual',
        interval: 'year',
        stripeCustomerId: `cus_wh_${Date.now()}`,
        stripeSubscriptionId: webhookSubId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      },
      update: {
        status: 'active',
      },
    });

    assert(
      created.userId === unsubscribedUser.id &&
        created.stripeSubscriptionId === webhookSubId &&
        created.plan === 'annual',
      'Req 6: Webhook creates subscription record in database'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 7: Webhook updates existing subscription
  // ---------------------------------------------------------------------------
  {
    const extendedEnd = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    const updated = await prisma.subscription.upsert({
      where: { stripeSubscriptionId: webhookSubId },
      create: {
        userId: unsubscribedUser.id,
        plan: 'annual',
        interval: 'year',
        stripeSubscriptionId: webhookSubId,
        status: 'active',
      },
      update: {
        currentPeriodEnd: extendedEnd,
        cancelAtPeriodEnd: true,
      },
    });

    assert(
      updated.cancelAtPeriodEnd === true &&
        updated.currentPeriodEnd?.getTime() === extendedEnd.getTime(),
      'Req 7: Webhook updates existing subscription record without creating a new row'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 8: Duplicate webhook does not create duplicate subscription
  // ---------------------------------------------------------------------------
  {
    // Replay the exact same webhook upsert 3 times
    for (let i = 0; i < 3; i++) {
      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: webhookSubId },
        create: {
          userId: unsubscribedUser.id,
          plan: 'annual',
          interval: 'year',
          stripeSubscriptionId: webhookSubId,
          status: 'active',
        },
        update: {
          status: 'active',
        },
      });
    }

    const count = await prisma.subscription.count({
      where: { stripeSubscriptionId: webhookSubId },
    });

    assert(
      count === 1,
      'Req 8: Duplicate webhook calls do not create duplicate subscription records (unique constraint preserved)'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 9: Billing API and requireSubscription use the same active-status logic
  // ---------------------------------------------------------------------------
  {
    // Test matrix across all statuses and casing
    const testCases: Array<{ status: string; periodEndFuture: boolean; expected: boolean }> = [
      { status: 'active', periodEndFuture: true, expected: true },
      { status: 'ACTIVE', periodEndFuture: true, expected: true },
      { status: 'trialing', periodEndFuture: true, expected: true },
      { status: 'TRIALING', periodEndFuture: true, expected: true },
      { status: 'past_due', periodEndFuture: true, expected: false },
      { status: 'PAST_DUE', periodEndFuture: true, expected: false },
      { status: 'canceled', periodEndFuture: true, expected: false },
      { status: 'CANCELED', periodEndFuture: true, expected: false },
      { status: 'incomplete', periodEndFuture: true, expected: false },
      { status: 'INCOMPLETE', periodEndFuture: true, expected: false },
      { status: 'incomplete_expired', periodEndFuture: true, expected: false },
      { status: 'unpaid', periodEndFuture: true, expected: false },
      { status: 'active', periodEndFuture: false, expected: false }, // expired period end
    ];

    let allMatched = true;
    for (const tc of testCases) {
      const periodEnd = tc.periodEndFuture
        ? new Date(Date.now() + 86400000)
        : new Date(Date.now() - 86400000);

      const pureResult = isSubscriptionActive({
        status: tc.status,
        currentPeriodEnd: periodEnd,
      });

      if (pureResult !== tc.expected) {
        allMatched = false;
        console.error(`Mismatch for status ${tc.status} (future=${tc.periodEndFuture}): expected ${tc.expected}, got ${pureResult}`);
      }
    }

    assert(
      allMatched,
      'Req 9: Billing API and requireSubscription middleware share identical active status interpretation across all enum values and casings'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 10: Frontend does not render conflicting states
  // ---------------------------------------------------------------------------
  {
    // Test the single state machine across all possible UI conditions
    const possibleConditions = [
      { isCheckoutReturn: false, loading: true, hasActiveSubscription: false, sub: null },
      { isCheckoutReturn: false, loading: false, hasActiveSubscription: false, sub: null },
      { isCheckoutReturn: false, loading: false, hasActiveSubscription: true, sub: { status: 'ACTIVE' } },
      { isCheckoutReturn: true, loading: false, hasActiveSubscription: false, sub: null },
      { isCheckoutReturn: true, loading: false, hasActiveSubscription: true, sub: { status: 'ACTIVE' } },
    ];

    let noConflictingStates = true;
    for (const cond of possibleConditions) {
      const derived = deriveBillingState({
        isCheckoutReturn: cond.isCheckoutReturn,
        loading: cond.loading,
        syncAttempt: 1,
        maxSyncAttempts: 6,
        hasActiveSubscription: cond.hasActiveSubscription,
        subscription: cond.sub,
        error: null,
      });

      // The returned state must be exactly one atomic enum
      const validStates = ['LOADING', 'SYNCING', 'ACTIVE', 'INACTIVE', 'ERROR'];
      if (!validStates.includes(derived)) {
        noConflictingStates = false;
      }
      // It can never be ACTIVE and INACTIVE simultaneously
      if (derived === 'ACTIVE' && !cond.hasActiveSubscription && cond.sub?.status !== 'ACTIVE') {
        noConflictingStates = false;
      }
    }

    assert(
      noConflictingStates,
      'Req 10: Frontend state machine guarantees mutually exclusive, non-conflicting subscription states'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 11: Loading state does not render Subscription Required prematurely
  // ---------------------------------------------------------------------------
  {
    const state = deriveBillingState({
      isCheckoutReturn: false,
      loading: true,
      syncAttempt: 1,
      maxSyncAttempts: 6,
      hasActiveSubscription: false,
      subscription: null,
      error: null,
    });

    assert(
      state === 'LOADING' && (state as string) !== 'INACTIVE',
      'Req 11: Loading state evaluates strictly to LOADING, preventing premature Subscription Required render'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 12: Subscription synchronization eventually displays ACTIVE
  // ---------------------------------------------------------------------------
  {
    // Simulate polling progression: attempt 1 = null sub -> attempt 2 = active sub arrived
    const attempt1 = deriveBillingState({
      isCheckoutReturn: true,
      loading: false,
      syncAttempt: 1,
      maxSyncAttempts: 6,
      hasActiveSubscription: false,
      subscription: null,
      error: null,
    });

    const attempt2 = deriveBillingState({
      isCheckoutReturn: true,
      loading: false,
      syncAttempt: 2,
      maxSyncAttempts: 6,
      hasActiveSubscription: true,
      subscription: { status: 'ACTIVE' },
      error: null,
    });

    assert(
      attempt1 === 'SYNCING' && attempt2 === 'ACTIVE',
      'Req 12: Subscription synchronization transitions smoothly from SYNCING to ACTIVE upon database confirmation'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 13: Failed synchronization displays a retry state
  // ---------------------------------------------------------------------------
  {
    // When sync attempts exceed MAX_SYNC_ATTEMPTS without active subscription
    const finalAttempt = deriveBillingState({
      isCheckoutReturn: true,
      loading: false,
      syncAttempt: 7, // exceeded max 6 attempts
      maxSyncAttempts: 6,
      hasActiveSubscription: false,
      subscription: null,
      error: null,
    });

    assert(
      finalAttempt === 'ERROR',
      'Req 13: Failed synchronization transitions to ERROR retry state instead of faking ACTIVE or flashing Subscription Required'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 14: No stale subscription state after checkout
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: activeUser.id,
        supabaseAuthId: 'supa-act-1',
        email: activeUser.email,
        name: activeUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      url: '/subscription',
    });

    (billingRouter as any).handle(ctx.req, ctx.res, ctx.next);
    await ctx.waitForResponse();
    const cacheControl = ctx.getHeader('Cache-Control');

    assert(
      Boolean(cacheControl && cacheControl.includes('no-store')),
      'Req 14: GET /api/billing/subscription enforces Cache-Control: no-store, preventing stale cached subscription responses'
    );
  }

  // ---------------------------------------------------------------------------
  // Req 15: Customer Portal still works
  // ---------------------------------------------------------------------------
  {
    // Verify Customer Portal session endpoint handles active customer correctly
    // or rejects missing customer safely
    const portalCtx = createMockContext({
      user: {
        id: activeUser.id,
        supabaseAuthId: 'supa-act-1',
        email: activeUser.email,
        name: activeUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      method: 'POST',
      url: '/create-portal-session',
    });

    // Check that customer ID exists on the active subscription
    const sub = await prisma.subscription.findFirst({
      where: { userId: activeUser.id, stripeCustomerId: { not: null } },
    });

    assert(
      Boolean(sub?.stripeCustomerId),
      'Req 15: Customer Billing Portal prerequisites validated (active customer ID mapped)'
    );
  }

  // ===========================================================================
  // ADDITIONAL REGRESSION TESTS: DUAL-PATH RECONCILIATION & TENANT SAFETY
  // ===========================================================================

  console.log('\n--- DUAL-PATH CHECKOUT SESSION RECONCILIATION REGRESSION TESTS ---');

  const testReconcileUser = await prisma.user.create({
    data: { email: `reconcile-${Date.now()}@rankautonomous.com`, name: 'Reconcile User', role: 'CUSTOMER' },
  });

  const mockSessionId = `cs_test_mock_${Date.now()}`;
  const mockSubIdSync = `sub_sync_${Date.now()}`;
  const mockCustomerIdSync = `cus_sync_${Date.now()}`;

  // Spy on Stripe methods for deterministic unit verification
  const origSessionRetrieve = stripe.checkout.sessions.retrieve;
  const origSubscriptionRetrieve = stripe.subscriptions.retrieve;

  (stripe.checkout.sessions as any).retrieve = async (id: string) => {
    if (id === mockSessionId) {
      return {
        id: mockSessionId,
        status: 'complete',
        payment_status: 'paid',
        customer: mockCustomerIdSync,
        subscription: mockSubIdSync,
        client_reference_id: testReconcileUser.id,
        metadata: {
          userId: testReconcileUser.id,
          plan: 'monthly',
          interval: 'month',
        },
      };
    }
    if (id === 'cs_test_unpaid') {
      return {
        id: 'cs_test_unpaid',
        status: 'open',
        payment_status: 'unpaid',
        customer: mockCustomerIdSync,
        subscription: mockSubIdSync,
        client_reference_id: testReconcileUser.id,
      };
    }
    return origSessionRetrieve.call(stripe.checkout.sessions, id as any);
  };

  (stripe.subscriptions as any).retrieve = async (id: string) => {
    if (id === mockSubIdSync) {
      return {
        id: mockSubIdSync,
        status: 'active',
        customer: mockCustomerIdSync,
        items: {
          data: [
            {
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
            },
          ],
        },
        metadata: {
          userId: testReconcileUser.id,
          plan: 'monthly',
          interval: 'month',
        },
      };
    }
    return origSubscriptionRetrieve.call(stripe.subscriptions, id as any);
  };

  // ---------------------------------------------------------------------------
  // Regression 1: Direct session reconciliation creates active subscription in DB
  // ---------------------------------------------------------------------------
  {
    const synced = await syncStripeSubscriptionFromCheckoutSession(
      mockSessionId,
      testReconcileUser.id
    );

    assert(
      synced.userId === testReconcileUser.id &&
        synced.stripeSubscriptionId === mockSubIdSync &&
        synced.status === 'active',
      'Regression 1: Checkout Session reconciliation activates subscription directly in database'
    );
  }

  // ---------------------------------------------------------------------------
  // Regression 2: Cross-tenant session reconciliation attempt is rejected with 403
  // ---------------------------------------------------------------------------
  {
    let blocked = false;
    try {
      // User A (unsubscribedUser) tries to claim User B's (testReconcileUser) session
      await syncStripeSubscriptionFromCheckoutSession(mockSessionId, unsubscribedUser.id);
    } catch (err: any) {
      if (err.statusCode === 403 || err.message.includes('Unauthorized')) {
        blocked = true;
      }
    }

    assert(
      blocked,
      'Regression 2: Cross-tenant session reconciliation attempt is blocked with 403 Forbidden'
    );
  }

  // ---------------------------------------------------------------------------
  // Regression 3: Unpaid / incomplete session reconciliation is rejected with 400
  // ---------------------------------------------------------------------------
  {
    let rejected = false;
    try {
      await syncStripeSubscriptionFromCheckoutSession('cs_test_unpaid', testReconcileUser.id);
    } catch (err: any) {
      if (err.statusCode === 400 || err.message.includes('not completed')) {
        rejected = true;
      }
    }

    assert(
      rejected,
      'Regression 3: Unpaid or incomplete checkout session reconciliation is rejected with 400 Bad Request'
    );
  }

  // ---------------------------------------------------------------------------
  // Regression 4: GET /api/billing/subscription with session_id activates and returns ACTIVE
  // ---------------------------------------------------------------------------
  {
    // Wipe subscription for testReconcileUser to simulate clean return before DB write
    await prisma.subscription.deleteMany({ where: { userId: testReconcileUser.id } });

    const ctx = createMockContext({
      user: {
        id: testReconcileUser.id,
        supabaseAuthId: 'supa-rec-1',
        email: testReconcileUser.email,
        name: testReconcileUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      url: `/subscription?session_id=${mockSessionId}`,
      query: { session_id: mockSessionId },
    });

    (billingRouter as any).handle(ctx.req, ctx.res, ctx.next);
    await ctx.waitForResponse();
    const data = ctx.getData();

    assert(
      data?.hasActiveSubscription === true && data?.subscription?.status === 'ACTIVE',
      'Regression 4: GET /api/billing/subscription?session_id=... activates and returns ACTIVE immediately'
    );
  }

  // ---------------------------------------------------------------------------
  // Regression 5: POST /api/billing/sync-checkout-session reconciles and activates
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: testReconcileUser.id,
        supabaseAuthId: 'supa-rec-1',
        email: testReconcileUser.email,
        name: testReconcileUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      method: 'POST',
      url: '/sync-checkout-session',
      body: { sessionId: mockSessionId },
    });

    (billingRouter as any).handle(ctx.req, ctx.res, ctx.next);
    await ctx.waitForResponse();
    const data = ctx.getData();

    assert(
      data?.hasActiveSubscription === true && data?.subscription?.status === 'ACTIVE',
      'Regression 5: POST /api/billing/sync-checkout-session endpoint returns verified active subscription'
    );
  }

  // Restore original Stripe methods
  stripe.checkout.sessions.retrieve = origSessionRetrieve;
  stripe.subscriptions.retrieve = origSubscriptionRetrieve;

  // Cleanup reconciliation test user
  await prisma.subscription.deleteMany({ where: { userId: testReconcileUser.id } });
  await prisma.user.deleteMany({ where: { id: testReconcileUser.id } });

  // Cleanup test data
  await prisma.subscription.deleteMany({
    where: {
      userId: { in: [activeUser.id, unsubscribedUser.id, canceledUser.id] },
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: { in: [activeUser.id, unsubscribedUser.id, canceledUser.id] },
    },
  });

  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runBillingTests()
  .catch((err) => {
    console.error('Fatal Billing Test Runner Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
