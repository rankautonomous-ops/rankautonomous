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

    if (!plan || (plan !== 'monthly' && plan !== 'annual')) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid plan selection. Expected "monthly" or "annual".',
      });
      return;
    }

    const priceInfo = getPriceIdForPlan(plan);
    if (!priceInfo || !priceInfo.priceId) {
      res.status(400).json({
        error: 'Configuration Error',
        message: `Stripe Price ID for plan "${plan}" is not configured on the server.`,
      });
      return;
    }

    // Resolve or provision Stripe customer
    const stripeCustomerId = await getOrCreateStripeCustomer(user);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
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
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('[Stripe Checkout Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to initiate Stripe Checkout session.',
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

    // Prioritize active or trialing subscriptions first
    let subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: {
          in: ['active', 'trialing', 'ACTIVE', 'TRIALING'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // If no active subscription and a sessionId is supplied, attempt direct session reconciliation
    if (!subscription && sessionId && sessionId.startsWith('cs_')) {
      try {
        subscription = await syncStripeSubscriptionFromCheckoutSession(sessionId, user.id);
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

    const hasActive = isSubscriptionActive(subscription);

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

export default router;
