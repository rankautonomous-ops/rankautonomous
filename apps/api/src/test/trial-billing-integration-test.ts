import { Request, Response, NextFunction } from 'express';
import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  stripe,
  getPriceIdForPlan,
  STRIPE_MONTHLY_PRICE_ID,
  STRIPE_ANNUAL_PRICE_ID,
} from '../lib/stripe';
import prisma from '../lib/database';
import billingRouter, { syncStripeSubscriptionFromCheckoutSession } from '../routes/billing';
import webhookRouter from '../routes/webhook';
import { PRICING_CONFIG } from '../lib/pricing';

/**
 * Lightweight mock context creator for unit and route testing
 */
function createMockContext(options: {
  headers?: Record<string, string>;
  body?: any;
  user?: any;
  params?: any;
  query?: any;
  method?: string;
  url?: string;
} = {}) {
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
    isNextCalled: () => nextCalled,
    waitForResponse: () =>
      Promise.race([
        responsePromise,
        new Promise((resolve) => setTimeout(() => resolve(responseData), 3000)),
      ]),
  };
}

async function runTrialBillingTests() {
  console.log('===============================================================');
  console.log('RUNNING $1 TRIAL CANCELLATION, AUTO-BILLING & DASHBOARD TESTS');
  console.log('===============================================================\n');

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

  // Set up mock test users in DB
  const timestamp = Date.now();
  const testUser = await prisma.user.create({
    data: {
      email: `trial-test-${timestamp}@rankautonomous.com`,
      name: 'Trial Tester',
      role: 'CUSTOMER',
    },
  });

  const testWebsite = await prisma.website.create({
    data: {
      userId: testUser.id,
      url: `https://test-${timestamp}.com`,
      name: 'Test Domain',
      status: 'ACTIVE',
      contentAutomationEnabled: false,
    },
  });

  const mockCustomerId = `cus_trial_${timestamp}`;
  const mockSubId = `sub_trial_${timestamp}`;

  // ---------------------------------------------------------------------------
  // Test 1: Pricing configuration defines 3-day duration, $1 upfront, $149/mo auto-renew
  // ---------------------------------------------------------------------------
  {
    const trialCfg = PRICING_CONFIG.trial;
    assert(
      trialCfg.amountDollars === 1 &&
        trialCfg.durationDays === 3 &&
        trialCfg.subsequentPlan === 'monthly' &&
        trialCfg.subsequentAmountDollars === 149 &&
        trialCfg.disclosureText.includes('$149.00/month') &&
        trialCfg.disclosureText.includes('3 days'),
      'Test 1: Pricing config authoritatively specifies 3-day duration, $1 upfront, $149/mo subsequent price'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 2: getPriceIdForPlan maps 'trial' to monthly price ID for recurring subscription
  // ---------------------------------------------------------------------------
  {
    const priceInfo = getPriceIdForPlan('trial');
    assert(
      priceInfo !== null &&
        priceInfo.priceId === STRIPE_MONTHLY_PRICE_ID &&
        priceInfo.interval === 'month',
      'Test 2: getPriceIdForPlan maps trial to monthly price ID'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3: Stripe Checkout Session creation for $1 trial
  // ---------------------------------------------------------------------------
  let capturedSessionParams: any = null;
  const origSessionsCreate = stripe.checkout.sessions.create;
  (stripe.checkout.sessions as any).create = async (params: any) => {
    capturedSessionParams = params;
    return {
      id: `cs_trial_mock_${timestamp}`,
      url: `https://checkout.stripe.com/pay/cs_trial_mock_${timestamp}`,
      customer: params.customer,
      metadata: params.metadata,
    };
  };

  const origCustomersList = stripe.customers.list;
  (stripe.customers as any).list = async () => ({
    data: [{ id: mockCustomerId }],
  });

  {
    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { plan: 'trial' },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/create-checkout-session' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    await handler(ctx.req, ctx.res);

    assert(
      capturedSessionParams !== null &&
        capturedSessionParams.mode === 'subscription' &&
        capturedSessionParams.branding_settings?.display_name === 'RankAutonomous' &&
        capturedSessionParams.subscription_data?.trial_period_days === 3 &&
        capturedSessionParams.line_items.some((i: any) => i.price === STRIPE_MONTHLY_PRICE_ID) &&
        capturedSessionParams.line_items.some((i: any) => i.price_data?.unit_amount === 100) &&
        capturedSessionParams.custom_text?.submit?.message.includes('$149.00/month'),
      'Test 3: Trial checkout session configures mode: subscription, 3-day trial period, $1 fee, RankAutonomous branding, and full disclosure'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3b: Monthly checkout session passes RankAutonomous branding
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { plan: 'monthly' },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/create-checkout-session' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    capturedSessionParams = null;
    await handler(ctx.req, ctx.res);

    assert(
      capturedSessionParams !== null &&
        capturedSessionParams.mode === 'subscription' &&
        capturedSessionParams.branding_settings?.display_name === 'RankAutonomous' &&
        capturedSessionParams.line_items.some((i: any) => i.price === STRIPE_MONTHLY_PRICE_ID),
      'Test 3b: Monthly checkout session passes branding_settings.display_name = RankAutonomous'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 3c: Annual checkout session passes RankAutonomous branding
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { plan: 'annual' },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/create-checkout-session' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    capturedSessionParams = null;
    await handler(ctx.req, ctx.res);

    assert(
      capturedSessionParams !== null &&
        capturedSessionParams.mode === 'subscription' &&
        capturedSessionParams.branding_settings?.display_name === 'RankAutonomous' &&
        capturedSessionParams.line_items.some((i: any) => i.price === STRIPE_ANNUAL_PRICE_ID),
      'Test 3c: Annual checkout session passes branding_settings.display_name = RankAutonomous'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 4: Prevent duplicate charges / checkout sessions
  // ---------------------------------------------------------------------------
  {
    // Mark user as having an active trial
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        trialActive: true,
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 3 * 86400 * 1000),
      },
    });

    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { plan: 'trial' },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/create-checkout-session' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    await handler(ctx.req, ctx.res);

    assert(
      ctx.getStatus() === 409 && ctx.getData()?.error === 'Conflict',
      'Test 4: Duplicate checkout request is rejected with 409 Conflict'
    );

    // Reset user trial state for subsequent tests
    await prisma.user.update({
      where: { id: testUser.id },
      data: { trialActive: false, trialStartedAt: null, trialEndsAt: null },
    });
  }

  // ---------------------------------------------------------------------------
  // Test 5: Reconciling Checkout Session for Trial activates trial state & database
  // ---------------------------------------------------------------------------
  const mockCheckoutSessionId = `cs_trial_complete_${timestamp}`;
  const origSessionRetrieve = stripe.checkout.sessions.retrieve;
  (stripe.checkout.sessions as any).retrieve = async (id: string) => {
    if (id === mockCheckoutSessionId) {
      return {
        id: mockCheckoutSessionId,
        status: 'complete',
        payment_status: 'paid',
        customer: mockCustomerId,
        subscription: mockSubId,
        metadata: {
          userId: testUser.id,
          plan: 'trial',
        },
      };
    }
    return origSessionRetrieve.call(stripe.checkout.sessions, id as any);
  };

  const origSubRetrieve = stripe.subscriptions.retrieve;
  let mockStripeSubStatus = 'trialing';
  let mockStripeCancelAtPeriodEnd = false;
  let mockCurrentPriceId = STRIPE_MONTHLY_PRICE_ID;

  (stripe.subscriptions as any).retrieve = async (id: string) => {
    if (id === mockSubId) {
      return {
        id: mockSubId,
        status: mockStripeSubStatus,
        customer: mockCustomerId,
        cancel_at_period_end: mockStripeCancelAtPeriodEnd,
        trial_start: Math.floor(Date.now() / 1000),
        trial_end: Math.floor(Date.now() / 1000) + 3 * 86400,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 3 * 86400,
        items: {
          data: [
            {
              id: `si_trial_${timestamp}`,
              price: {
                id: mockCurrentPriceId,
                recurring: { interval: 'month' },
              },
            },
          ],
        },
        metadata: {
          userId: testUser.id,
          plan: 'trial',
        },
      };
    }
    return origSubRetrieve.call(stripe.subscriptions, id as any);
  };

  {
    const synced = await syncStripeSubscriptionFromCheckoutSession(
      mockCheckoutSessionId,
      testUser.id
    );

    const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    const updatedWebsites = await prisma.website.findMany({ where: { userId: testUser.id } });

    assert(
      synced.plan === 'trial' &&
        synced.status === 'trialing' &&
        updatedUser?.trialActive === true &&
        updatedUser?.trialEndsAt !== null &&
        updatedWebsites[0]?.contentAutomationEnabled === true,
      'Test 5: Trial session sync activates subscription in DB, sets trialActive=true, and enables website automation'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 6: GET /api/billing/subscription returns enriched cancellationDetails
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/subscription' &&
        layer.route.methods.get
    )?.route.stack[1].handle;

    await handler(ctx.req, ctx.res);
    const data = ctx.getData();

    assert(
      data.hasActiveSubscription === true &&
        data.trialActive === true &&
        data.cancellationDetails !== undefined &&
        data.cancellationDetails.planCode === 'trial' &&
        data.cancellationDetails.planName === '3-Day Trial ($1.00)' &&
        data.cancellationDetails.isCancelling === false &&
        data.cancellationDetails.autoRenews === true &&
        data.cancellationDetails.subsequentAmount === '$149.00/month' &&
        data.cancellationDetails.notice.includes('$149/mo'),
      'Test 6: GET /subscription returns full cancellationDetails with subsequent amount and autoRenews=true'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 7: Item 3: Cancel $1 trial via POST /api/billing/subscription/cancel
  // ---------------------------------------------------------------------------
  let capturedStripeCancelParam: any = null;
  const origSubUpdate = stripe.subscriptions.update;
  (stripe.subscriptions as any).update = async (id: string, params: any) => {
    capturedStripeCancelParam = params;
    if (params.cancel_at_period_end !== undefined) {
      mockStripeCancelAtPeriodEnd = params.cancel_at_period_end;
    }
    if (params.items) {
      mockCurrentPriceId = params.items[0].price;
    }
    return {
      id,
      status: mockStripeSubStatus,
      cancel_at_period_end: mockStripeCancelAtPeriodEnd,
      items: {
        data: [{ id: `si_trial_${timestamp}`, price: { id: mockCurrentPriceId } }],
      },
    };
  };

  {
    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { cancel: true },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/subscription/cancel' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    await handler(ctx.req, ctx.res);
    const data = ctx.getData();

    const dbSub = await prisma.subscription.findFirst({ where: { userId: testUser.id } });

    assert(
      data.success === true &&
        data.cancelAtPeriodEnd === true &&
        capturedStripeCancelParam.cancel_at_period_end === true &&
        dbSub?.cancelAtPeriodEnd === true &&
        data.message.includes('not be charged the $149/mo'),
      'Test 7: Cancelling trial updates Stripe cancel_at_period_end: true, syncs DB, and discloses no $149 charge'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 8: GET /subscription reflects scheduled trial cancellation details
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/subscription' &&
        layer.route.methods.get
    )?.route.stack[1].handle;

    await handler(ctx.req, ctx.res);
    const data = ctx.getData();

    assert(
      data.cancellationDetails.isCancelling === true &&
        data.cancellationDetails.cancelAtPeriodEnd === true &&
        data.cancellationDetails.autoRenews === false &&
        data.cancellationDetails.notice.includes('scheduled to cancel') &&
        data.cancellationDetails.notice.includes('NOT be charged the $149.00'),
      'Test 8: GET /subscription reports isCancelling: true and clearly informs user that $149 will NOT be charged'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 9: Resume trial renewal via POST /api/billing/subscription/cancel
  // ---------------------------------------------------------------------------
  {
    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { cancel: false },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/subscription/cancel' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    await handler(ctx.req, ctx.res);
    const data = ctx.getData();

    const dbSub = await prisma.subscription.findFirst({ where: { userId: testUser.id } });

    assert(
      data.success === true &&
        data.cancelAtPeriodEnd === false &&
        dbSub?.cancelAtPeriodEnd === false,
      'Test 9: Resuming subscription sets cancelAtPeriodEnd: false and restores auto-renewal'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 10: Automatic billing transition via webhook invoice.paid
  // ---------------------------------------------------------------------------
  {
    // Simulate webhook constructEvent
    const origConstruct = stripe.webhooks.constructEvent;
    (stripe.webhooks as any).constructEvent = () => ({
      type: 'invoice.paid',
      data: {
        object: {
          id: `in_trial_paid_${timestamp}`,
          subscription: mockSubId,
          amount_paid: 14900,
          status: 'paid',
        },
      },
    });

    const ctx = createMockContext({
      headers: { 'stripe-signature': 'mock_sig' },
      body: Buffer.from('{}'),
    });

    const webhookHandler = (webhookRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/webhook' &&
        layer.route.methods.post
    )?.route.stack[0].handle;

    await webhookHandler(ctx.req, ctx.res);

    const graduatedSub = await prisma.subscription.findFirst({ where: { userId: testUser.id } });
    const graduatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });

    assert(
      graduatedSub?.status === 'active' &&
        graduatedSub?.plan === 'monthly' &&
        graduatedUser?.trialActive === false &&
        graduatedUser?.isPaused === false,
      'Test 10: Automatic billing on invoice.paid graduates trial to active monthly subscription and clears trialActive'
    );

    stripe.webhooks.constructEvent = origConstruct;
  }

  // ---------------------------------------------------------------------------
  // Test 11: Payment failure handling via webhook invoice.payment_failed
  // ---------------------------------------------------------------------------
  {
    const origConstruct = stripe.webhooks.constructEvent;
    (stripe.webhooks as any).constructEvent = () => ({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: `in_failed_${timestamp}`,
          subscription: mockSubId,
          status: 'open',
        },
      },
    });

    const ctx = createMockContext({
      headers: { 'stripe-signature': 'mock_sig' },
      body: Buffer.from('{}'),
    });

    const webhookHandler = (webhookRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/webhook' &&
        layer.route.methods.post
    )?.route.stack[0].handle;

    await webhookHandler(ctx.req, ctx.res);

    const pastDueSub = await prisma.subscription.findFirst({ where: { userId: testUser.id } });
    const pausedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    const pausedWebsite = await prisma.website.findUnique({ where: { id: testWebsite.id } });
    const notification = await prisma.notification.findFirst({
      where: { userId: testUser.id, type: 'BILLING' },
      orderBy: { createdAt: 'desc' },
    });

    assert(
      pastDueSub?.status === 'past_due' &&
        pausedUser?.isPaused === true &&
        pausedWebsite?.contentAutomationEnabled === false &&
        notification !== null &&
        notification.title.includes('Payment Failed'),
      'Test 11: Failed payment marks status: past_due, sets isPaused: true, pauses automation, and creates notification'
    );

    stripe.webhooks.constructEvent = origConstruct;
  }

  // ---------------------------------------------------------------------------
  // Test 12: Item 5: Plan Upgrade / Change via POST /api/billing/subscription/change-plan
  // ---------------------------------------------------------------------------
  {
    // Restore active status
    await prisma.subscription.updateMany({
      where: { userId: testUser.id },
      data: { status: 'active', plan: 'monthly', interval: 'month' },
    });
    await prisma.user.update({
      where: { id: testUser.id },
      data: { isPaused: false },
    });

    let changePlanParams: any = null;
    (stripe.subscriptions as any).update = async (id: string, params: any) => {
      changePlanParams = params;
      return {
        id,
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400,
        items: {
          data: [{ id: `si_trial_${timestamp}`, price: { id: STRIPE_ANNUAL_PRICE_ID } }],
        },
      };
    };

    const ctx = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { newPlan: 'annual' },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/subscription/change-plan' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    await handler(ctx.req, ctx.res);
    const data = ctx.getData();

    const upgradedSub = await prisma.subscription.findFirst({ where: { userId: testUser.id } });

    assert(
      data.success === true &&
        upgradedSub?.plan === 'annual' &&
        upgradedSub?.interval === 'year' &&
        changePlanParams?.items[0]?.price === STRIPE_ANNUAL_PRICE_ID &&
        changePlanParams?.proration_behavior === 'create_prorations',
      'Test 12: Plan change upgrades monthly to annual plan in Stripe with proration and syncs database'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 13: Reject duplicate or invalid plan change requests
  // ---------------------------------------------------------------------------
  {
    // Try to switch to the same plan ('annual')
    const ctxSame = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { newPlan: 'annual' },
    });

    const handler = (billingRouter as any).stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === '/subscription/change-plan' &&
        layer.route.methods.post
    )?.route.stack[1].handle;

    await handler(ctxSame.req, ctxSame.res);

    // Try an invalid plan name
    const ctxInvalid = createMockContext({
      user: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      body: { newPlan: 'enterprise_hacked' },
    });
    await handler(ctxInvalid.req, ctxInvalid.res);

    assert(
      ctxSame.getStatus() === 400 &&
        ctxSame.getData()?.message?.includes('already subscribed') &&
        ctxInvalid.getStatus() === 400 &&
        ctxInvalid.getData()?.message?.includes('Invalid plan selection'),
      'Test 13: Reject change to identical plan or invalid plan with 400 Bad Request'
    );
  }

  // Clean up mock stubs
  stripe.checkout.sessions.create = origSessionsCreate;
  stripe.checkout.sessions.retrieve = origSessionRetrieve;
  stripe.subscriptions.retrieve = origSubRetrieve;
  stripe.subscriptions.update = origSubUpdate;
  stripe.customers.list = origCustomersList;

  // Clean up database test fixtures
  await prisma.notification.deleteMany({ where: { userId: testUser.id } });
  await prisma.subscription.deleteMany({ where: { userId: testUser.id } });
  await prisma.website.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTrialBillingTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution threw an uncaught error:', err);
    process.exit(1);
  });
