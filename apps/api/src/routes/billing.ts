import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth';
import { isSubscriptionActive } from '../middleware/subscription';
import { extractPeriodDates } from './webhook';
import {
  stripe,
  getStripeAppUrl,
  getPriceIdForPlan,
  getOrCreateStripeCustomer,
} from '../lib/stripe';
import prisma from '../lib/database';

const router = Router();

/**
 * POST /api/billing/create-checkout-session
 * Creates a Stripe Checkout session in subscription mode for the authenticated user.
 */
router.post('/create-checkout-session', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { plan } = req.body;

    if (!plan || (plan !== 'monthly' && plan !== 'annual' && plan !== 'trial')) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid plan selection. Expected "monthly", "annual", or "trial".',
      });
      return;
    }

    // Duplicate charge prevention: Check if user already has an active subscription or trial
    const existingActiveSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing', 'ACTIVE', 'TRIALING'] },
      },
    });

    if (existingActiveSub) {
      res.status(409).json({
        error: 'Conflict',
        message: 'You already have an active subscription or trial. You can manage or upgrade your plan in your billing settings.',
      });
      return;
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (plan === 'trial' && dbUser?.trialActive && dbUser.trialEndsAt && new Date(dbUser.trialEndsAt).getTime() > Date.now()) {
      res.status(409).json({
        error: 'Conflict',
        message: 'You already have an active 3-day trial. You can upgrade your plan anytime from your dashboard.',
      });
      return;
    }

    const stripeCustomerId = await getOrCreateStripeCustomer(user);

    let sessionParams: Stripe.Checkout.SessionCreateParams;

    if (plan === 'trial') {
      const monthlyPriceInfo = getPriceIdForPlan('monthly');
      if (!monthlyPriceInfo || !monthlyPriceInfo.priceId) {
        res.status(400).json({
          error: 'Configuration Error',
          message: 'Stripe Monthly Price ID is not configured on the server.',
        });
        return;
      }

      sessionParams = {
        customer: stripeCustomerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        branding_settings: {
          display_name: 'RankAutonomous',
        },
        line_items: [
          {
            // Monthly recurring subscription ($149/mo) with 3-day trial
            price: monthlyPriceInfo.priceId,
            quantity: 1,
          },
          {
            // $1.00 upfront trial fee charged immediately on invoice #1
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'RankAutonomous 3-Day Trial Access',
                description: '$1.00 upfront for 3 days full access, then automatically renews at $149.00/month unless cancelled in dashboard before trial ends.',
              },
              unit_amount: 100, // $1.00 in cents
            },
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: 3,
          metadata: {
            userId: user.id,
            plan: 'trial',
            subsequentPlan: 'monthly',
            trialDurationDays: '3',
            subsequentPrice: '$149/mo',
          },
        },
        custom_text: {
          submit: {
            message: 'By starting your $1.00 3-day trial, you authorize RankAutonomous to charge $1.00 today and automatically charge $149.00/month thereafter unless you cancel in your dashboard before the trial ends.',
          },
        },
        success_url: `${getStripeAppUrl()}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}&plan=trial`,
        cancel_url: `${getStripeAppUrl()}/pricing?checkout=cancelled`,
        client_reference_id: user.id,
        metadata: {
          userId: user.id,
          plan: 'trial',
          subsequentPlan: 'monthly',
          trialDurationDays: '3',
          subsequentPrice: '$149/mo',
        },
      };
    } else {
      const priceInfo = getPriceIdForPlan(plan);
      if (!priceInfo || !priceInfo.priceId) {
        res.status(400).json({
          error: 'Configuration Error',
          message: `Stripe Price ID for plan "${plan}" is not configured on the server.`,
        });
        return;
      }

      sessionParams = {
        customer: stripeCustomerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        branding_settings: {
          display_name: 'RankAutonomous',
        },
        line_items: [
          {
            price: priceInfo.priceId,
            quantity: 1,
          },
        ],
        success_url: `${getStripeAppUrl()}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${getStripeAppUrl()}/pricing?checkout=cancelled`,
        client_reference_id: user.id,
        metadata: {
          userId: user.id,
          plan,
          interval: priceInfo.interval,
        },
        subscription_data: {
          metadata: {
            userId: user.id,
            plan,
            interval: priceInfo.interval,
          },
        },
      };
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (stripeErr: any) {
      if (
        stripeErr?.code === 'resource_missing' ||
        stripeErr?.message?.includes('No such customer')
      ) {
        console.warn(
          `[Stripe Checkout] Customer "${stripeCustomerId}" does not exist in active Stripe account. Generating fresh customer and retrying...`
        );
        const freshCustomer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: { userId: user.id },
        });
        sessionParams.customer = freshCustomer.id;
        await prisma.subscription.updateMany({
          where: { userId: user.id },
          data: { stripeCustomerId: freshCustomer.id },
        });
        session = await stripe.checkout.sessions.create(sessionParams);
      } else {
        throw stripeErr;
      }
    }

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('[Stripe Checkout Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error?.message || 'Failed to initiate Stripe Checkout session.',
    });
  }
});

/**
 * POST /api/billing/create-portal-session
 * Creates a Stripe Customer Billing Portal session for subscription management.
 */
router.post('/create-portal-session', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    // Find user's existing Stripe Customer ID
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        stripeCustomerId: { not: null },
      },
      select: { stripeCustomerId: true },
    });

    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      // Check if a customer exists in Stripe for this email
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      }
    }

    if (!customerId) {
      res.status(400).json({
        error: 'No Billing Profile',
        message: 'No active Stripe billing customer found. Please subscribe to a plan first.',
      });
      return;
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getStripeAppUrl()}/app/billing`,
    });

    res.json({
      url: portalSession.url,
    });
  } catch (error: any) {
    console.error('[Stripe Portal Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create billing portal session.',
    });
  }
});

/**
 * Synchronizes and activates a subscription record directly from a verified Stripe Checkout Session.
 * Strictly verifies that the session belongs to the requesting user and has been completed/paid.
 */
export async function syncStripeSubscriptionFromCheckoutSession(
  sessionId: string,
  userId: string
) {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    const error: any = new Error('Invalid Checkout Session ID.');
    error.statusCode = 400;
    throw error;
  }

  // Retrieve checkout session from Stripe
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });

  if (!session) {
    const error: any = new Error('Checkout session not found on Stripe.');
    error.statusCode = 404;
    throw error;
  }

  // Strict tenant security check: ensure session belongs to authenticated user
  const sessionUserId = session.metadata?.userId || session.client_reference_id;
  if (!sessionUserId || sessionUserId !== userId) {
    const error: any = new Error('Unauthorized: Checkout session belongs to a different user account.');
    error.statusCode = 403;
    throw error;
  }

  // Verify that payment actually completed
  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    const error: any = new Error(
      `Checkout session is not paid or completed. Status: ${session.status}, Payment: ${session.payment_status}`
    );
    error.statusCode = 400;
    throw error;
  }

  if (!session.subscription) {
    const error: any = new Error('No subscription attached to checkout session.');
    error.statusCode = 400;
    throw error;
  }

  let sub: Stripe.Subscription;
  if (typeof session.subscription === 'string') {
    sub = await stripe.subscriptions.retrieve(session.subscription);
  } else {
    sub = session.subscription as Stripe.Subscription;
  }

  const { currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } = extractPeriodDates(sub);
  const plan = session.metadata?.plan || sub.metadata?.plan || 'monthly';
  const interval = session.metadata?.interval || sub.metadata?.interval || (plan === 'annual' ? 'year' : 'month');
  const stripeCustomerId = session.customer as string;

  const subscription = await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: {
      userId,
      plan,
      interval,
      stripeCustomerId,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    },
    update: {
      userId,
      plan,
      interval,
      stripeCustomerId,
      status: sub.status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    },
  });

  if (plan === 'trial' || sub.status === 'trialing') {
    const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : currentPeriodStart;
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : currentPeriodEnd;
    await prisma.user.update({
      where: { id: userId },
      data: {
        trialActive: true,
        trialStartedAt: trialStart,
        trialEndsAt: trialEnd,
        isPaused: false,
      },
    });
  }

  if (sub.status === 'active' || sub.status === 'trialing') {
    await prisma.user.update({
      where: { id: userId },
      data: { isPaused: false },
    });
    await prisma.website.updateMany({
      where: { userId },
      data: { contentAutomationEnabled: true },
    });
  }

  console.log(`[Stripe Sync] Synchronized subscription ${sub.id} for user ${userId} from checkout session ${sessionId}`);
  return subscription;
}

/**
 * GET /api/billing/subscription
 * Retrieves the authenticated user's current subscription record and status.
 * Dynamically evaluates status using unified isSubscriptionActive logic.
 * Supports optional session_id query param for immediate post-checkout reconciliation.
 */
router.get('/subscription', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const sessionId = req.query.session_id as string | undefined;

    // Prevent any browser or intermediate proxy caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Fetch user to get trial and paused status
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        subscriptions: {
          where: {
            status: {
              in: ['active', 'trialing', 'ACTIVE', 'TRIALING'],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        }
      }
    });

    let subscription = dbUser?.subscriptions[0] || null;

    // If no active subscription and a sessionId is supplied, attempt direct session reconciliation
    if (!subscription && sessionId && sessionId.startsWith('cs_')) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.subscription) {
          subscription = await syncStripeSubscriptionFromCheckoutSession(sessionId, user.id);
        } else if (session.metadata?.plan === 'trial') {
          // Sync trial state directly if paid without subscription
          if (session.payment_status === 'paid' && dbUser) {
            const now = new Date();
            const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            await prisma.user.update({
              where: { id: user.id },
              data: {
                trialActive: true,
                trialStartedAt: now,
                trialEndsAt,
                isPaused: false,
              },
            });
            // Update dbUser state to reflect this right now
            dbUser.trialActive = true;
            dbUser.trialStartedAt = now;
            dbUser.trialEndsAt = trialEndsAt;
            dbUser.isPaused = false;
          }
        }
      } catch (syncErr: any) {
        console.warn(`[Subscription Sync Warning]: Failed to sync session ${sessionId}:`, syncErr.message);
      }
    }

    // If still no active subscription, retrieve most recent record (e.g. canceled, past_due)
    if (!subscription) {
      subscription = await prisma.subscription.findFirst({
        where: {
          userId: user.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }

    let hasActive = false;
    if (dbUser && !dbUser.isPaused) {
      if (isSubscriptionActive(subscription)) {
        hasActive = true;
      } else if (dbUser.trialActive && dbUser.trialEndsAt && new Date(dbUser.trialEndsAt).getTime() > Date.now()) {
        hasActive = true;
      }
    }

    // Determine current plan display name and cancellation details
    const isTrial = Boolean(
      (subscription && (subscription.plan === 'trial' || subscription.status?.toLowerCase() === 'trialing')) ||
      (dbUser?.trialActive && dbUser.trialEndsAt && new Date(dbUser.trialEndsAt).getTime() > Date.now())
    );

    const isAnnual = subscription?.plan === 'annual';
    const isMonthly = !isTrial && !isAnnual && (subscription?.plan === 'monthly' || hasActive);

    const planCode = isTrial ? 'trial' : (isAnnual ? 'annual' : (isMonthly ? 'monthly' : (subscription?.plan || 'none')));
    const planName = isTrial
      ? '3-Day Trial ($1.00)'
      : (isAnnual ? 'Annual Plan ($1,188/year)' : (isMonthly ? 'Monthly Plan ($149/month)' : 'No Active Plan'));

    const effectiveDate = subscription?.currentPeriodEnd || dbUser?.trialEndsAt || null;
    const isCancelling = Boolean(subscription?.cancelAtPeriodEnd);

    const cancellationDetails = {
      isCancelling,
      cancelAtPeriodEnd: isCancelling,
      effectiveDate,
      planCode,
      planName,
      autoRenews: hasActive && !isCancelling,
      subsequentChargeWillOccur: hasActive && !isCancelling,
      subsequentAmount: isAnnual ? '$1,188.00/year' : '$149.00/month',
      nextBillingDate: (hasActive && !isCancelling && effectiveDate) ? effectiveDate : null,
      notice: isCancelling
        ? (isTrial
            ? `Your trial is scheduled to cancel. Full access remains active until ${effectiveDate ? new Date(effectiveDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'the end of your 3-day period'}. You will NOT be charged the $149.00 monthly subscription fee.`
            : `Your subscription is scheduled to cancel. Access remains active until ${effectiveDate ? new Date(effectiveDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'period end'}. You will not be charged again.`)
        : (isTrial
            ? `Your 3-day trial is active. It will automatically convert to the monthly subscription ($149/mo) on ${effectiveDate ? new Date(effectiveDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'trial end'} unless cancelled before then.`
            : (hasActive
                ? `Your subscription automatically renews on ${effectiveDate ? new Date(effectiveDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'the next billing cycle'}.`
                : 'No active subscription.')),
    };

    res.json({
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            interval: subscription.interval,
            status: subscription.status ? subscription.status.toUpperCase() : 'INACTIVE',
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            createdAt: subscription.createdAt,
            updatedAt: subscription.updatedAt,
          }
        : null,
      hasActiveSubscription: hasActive,
      trialActive: dbUser?.trialActive || false,
      trialStartedAt: dbUser?.trialStartedAt || null,
      trialEndsAt: dbUser?.trialEndsAt || null,
      isPaused: dbUser?.isPaused || false,
      cancellationDetails,
    });
  } catch (error: any) {
    console.error('[Subscription Fetch Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve subscription details.',
    });
  }
});

/**
 * POST /api/billing/sync-checkout-session
 * Explicit endpoint to reconcile a completed checkout session for the authenticated user.
 */
router.post('/sync-checkout-session', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required sessionId parameter.',
      });
      return;
    }

    const subscription = await syncStripeSubscriptionFromCheckoutSession(sessionId, user.id);
    const hasActive = isSubscriptionActive(subscription);

    res.json({
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        interval: subscription.interval,
        status: subscription.status ? subscription.status.toUpperCase() : 'INACTIVE',
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
      },
      hasActiveSubscription: hasActive,
    });
  } catch (error: any) {
    const status = error.statusCode || 500;
    console.error(`[Checkout Sync Error ${status}]:`, error?.message || error);
    res.status(status).json({
      error: status === 403 ? 'Forbidden' : 'Sync Error',
      message: error.message || 'Failed to synchronize checkout session.',
    });
  }
});

/**
 * GET /api/billing/invoices
 * Retrieves the historical invoices for the authenticated user's active subscription customer.
 */
router.get('/invoices', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, stripeCustomerId: { not: null } },
      orderBy: { createdAt: 'desc' }
    });

    if (!subscription || !subscription.stripeCustomerId) {
      res.json({ invoices: [] });
      return;
    }

    const invoices = await stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 24, // last 2 years
    });

    const formattedInvoices = invoices.data.map(inv => ({
      id: inv.id,
      amountPaid: inv.amount_paid,
      status: inv.status,
      created: inv.created,
      pdf: inv.invoice_pdf,
      number: inv.number,
      currency: inv.currency
    }));

    res.json({ invoices: formattedInvoices });
  } catch (error: any) {
    console.error('[Stripe Invoices Error]:', error?.message || error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve invoices.' });
  }
});

/**
 * GET /api/billing/payment-methods
 * Retrieves the user's saved payment methods (cards).
 */
router.get('/payment-methods', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, stripeCustomerId: { not: null } },
      orderBy: { createdAt: 'desc' }
    });

    if (!subscription || !subscription.stripeCustomerId) {
      res.json({ paymentMethods: [] });
      return;
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: subscription.stripeCustomerId,
      type: 'card',
    });

    const formatted = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    }));

    res.json({ paymentMethods: formatted });
  } catch (error: any) {
    console.error('[Stripe Payment Methods Error]:', error?.message || error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve payment methods.' });
  }
});

/**
 * POST /api/billing/payment-methods/setup
 * Creates a SetupIntent to securely collect a new card on the frontend via Stripe Elements.
 */
router.post('/payment-methods/setup', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    let customerId: string | null = null;
    
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, stripeCustomerId: { not: null } },
      orderBy: { createdAt: 'desc' }
    });

    customerId = subscription?.stripeCustomerId || null;

    if (!customerId) {
      // Fallback: see if customer exists
      const existingCustomers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      }
    }

    if (!customerId) {
      customerId = await getOrCreateStripeCustomer(user);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session', // to allow recurring billing
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (error: any) {
    console.error('[Stripe SetupIntent Error]:', error?.message || error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to initiate payment method update.' });
  }
});

/**
 * POST /api/billing/subscription/cancel
 * Toggles cancel_at_period_end for the active subscription or trial.
 */
router.post('/subscription/cancel', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { cancel } = req.body; // true to cancel at period end, false to resume

    if (typeof cancel !== 'boolean') {
      res.status(400).json({ error: 'Bad Request', message: 'Missing boolean "cancel" parameter.' });
      return;
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['active', 'trialing', 'ACTIVE', 'TRIALING'] } },
      orderBy: { createdAt: 'desc' },
    });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

    if (subscription?.stripeSubscriptionId) {
      const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: cancel,
      });

      // Sync database immediately
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: cancel },
      });

      const effectiveDate = subscription.currentPeriodEnd || dbUser?.trialEndsAt;
      const isTrial = subscription.plan === 'trial' || subscription.status.toLowerCase() === 'trialing';

      res.json({
        success: true,
        cancelAtPeriodEnd: updated.cancel_at_period_end,
        effectiveDate,
        message: cancel
          ? (isTrial
              ? 'Your $1 trial cancellation has been scheduled. Full access continues until your trial ends, and you will not be charged the $149/mo subscription fee.'
              : 'Your subscription cancellation has been scheduled. Full access continues until your billing period ends, and you will not be charged again.')
          : 'Subscription renewal has been resumed.',
      });
      return;
    }

    if (dbUser?.trialActive) {
      const effectiveDate = dbUser.trialEndsAt;
      res.json({
        success: true,
        cancelAtPeriodEnd: cancel,
        effectiveDate,
        message: cancel
          ? 'Your $1 trial cancellation has been confirmed. Full access continues until your trial ends with no subsequent charges.'
          : 'Trial renewal resumed.',
      });
      return;
    }

    res.status(404).json({ error: 'Not Found', message: 'No active subscription or trial found to modify.' });
  } catch (error: any) {
    console.error('[Stripe Cancel Error]:', error?.message || error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update subscription cancellation status.' });
  }
});

/**
 * POST /api/billing/subscription/change-plan
 * Allows upgrading or switching plans between monthly and annual plans.
 * Automatically prorates via Stripe and synchronizes database state.
 */
router.post('/subscription/change-plan', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { newPlan } = req.body || {};

    if (!newPlan || (newPlan !== 'monthly' && newPlan !== 'annual')) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid plan selection. Expected "monthly" or "annual".',
      });
      return;
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing', 'ACTIVE', 'TRIALING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'No active Stripe subscription found to modify. Please subscribe to a plan first.',
      });
      return;
    }

    if (subscription.plan === newPlan) {
      res.status(400).json({
        error: 'Bad Request',
        message: `You are already subscribed to the ${newPlan} plan.`,
      });
      return;
    }

    const priceInfo = getPriceIdForPlan(newPlan);
    if (!priceInfo || !priceInfo.priceId) {
      res.status(400).json({
        error: 'Configuration Error',
        message: `Stripe Price ID for plan "${newPlan}" is not configured on the server.`,
      });
      return;
    }

    // Retrieve subscription from Stripe to obtain the current item ID
    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    const currentItem = stripeSub.items.data[0];

    if (!currentItem) {
      res.status(400).json({
        error: 'Invalid Subscription',
        message: 'Subscription has no line items on Stripe.',
      });
      return;
    }

    const updateParams: Stripe.SubscriptionUpdateParams = {
      items: [
        {
          id: currentItem.id,
          price: priceInfo.priceId,
        },
      ],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
      metadata: {
        userId: user.id,
        plan: newPlan,
        interval: priceInfo.interval,
      },
    };

    // If currently trialing, end trial immediately so new plan activates
    if (stripeSub.status === 'trialing') {
      updateParams.trial_end = 'now';
    }

    const updatedStripeSub = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      updateParams
    );

    const { currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } = extractPeriodDates(updatedStripeSub);

    const updatedSub = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: newPlan,
        interval: priceInfo.interval,
        status: updatedStripeSub.status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        trialActive: false,
        isPaused: false,
      },
    });

    await prisma.website.updateMany({
      where: { userId: user.id },
      data: { contentAutomationEnabled: true },
    });

    res.json({
      success: true,
      subscription: {
        id: updatedSub.id,
        plan: updatedSub.plan,
        interval: updatedSub.interval,
        status: updatedSub.status.toUpperCase(),
        currentPeriodStart: updatedSub.currentPeriodStart,
        currentPeriodEnd: updatedSub.currentPeriodEnd,
        cancelAtPeriodEnd: updatedSub.cancelAtPeriodEnd,
      },
      message: `Successfully switched to the ${newPlan} plan.`,
    });
  } catch (error: any) {
    console.error('[Stripe Change Plan Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error?.message || 'Failed to update subscription plan.',
    });
  }
});

export default router;
