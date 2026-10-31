import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, getStripeWebhookSecret } from '../lib/stripe';
import prisma from '../lib/database';

const router = Router();

/**
 * Helper to safely extract subscription timestamps across Stripe SDK versions
 */
export function extractPeriodDates(sub: any) {
  const startSec =
    sub.trial_start ||
    sub.current_period_start ||
    sub.items?.data?.[0]?.current_period_start ||
    sub.created ||
    Math.floor(Date.now() / 1000);

  const endSec =
    sub.trial_end ||
    sub.current_period_end ||
    sub.items?.data?.[0]?.current_period_end ||
    (startSec + 30 * 24 * 60 * 60);

  return {
    currentPeriodStart: new Date(startSec * 1000),
    currentPeriodEnd: new Date(endSec * 1000),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

/**
 * POST /api/stripe/webhook
 * Handles asynchronous Stripe events with signature verification.
 * Expects the raw request body Buffer.
 */
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  const webhookSecret = getStripeWebhookSecret();

  if (!webhookSecret) {
    console.warn('[Stripe Webhook] Warning: STRIPE_WEBHOOK_SECRET is not configured on the server.');
    res.status(500).json({ error: 'Server misconfiguration: Webhook secret missing' });
    return;
  }

  let event: Stripe.Event;

  try {
    // req.body MUST be the raw Buffer
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook Signature Error]: ${err.message}`);
    res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId || session.client_reference_id;
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;
        const plan = session.metadata?.plan || 'monthly';
        const interval = session.metadata?.interval || (plan === 'annual' ? 'year' : 'month');

        if (userId && stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const { currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } = extractPeriodDates(sub);

          await prisma.subscription.upsert({
            where: { stripeSubscriptionId },
            create: {
              userId,
              plan,
              interval,
              stripeCustomerId,
              stripeSubscriptionId,
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
            console.log(`[Stripe Webhook] Started $1 trial for user ${userId} with auto-billing at ${trialEnd.toISOString()}`);
          }

          // Subscription purchased, clear pause state if active and enable automation on user's websites
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

          console.log(`[Stripe Webhook] Synchronized subscription ${stripeSubscriptionId} for user ${userId}`);
        } else if (plan === 'trial' && userId && session.payment_status === 'paid') {
          // Fallback if standalone trial mode without subscription
          const now = new Date();
          const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
          await prisma.user.update({
            where: { id: userId },
            data: {
              trialActive: true,
              trialStartedAt: now,
              trialEndsAt,
              isPaused: false, // Ensure they are active immediately
            },
          });
          await prisma.website.updateMany({
            where: { userId },
            data: { contentAutomationEnabled: true },
          });
          console.log(`[Stripe Webhook] Started fallback trial for user ${userId}`);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const stripeSubscriptionId = subscription.id as string;
        const stripeCustomerId = subscription.customer as string;
        const status = subscription.status as string;
        const plan = subscription.metadata?.plan || 'monthly';
        const interval =
          subscription.metadata?.interval ||
          (subscription.items?.data?.[0]?.price?.recurring?.interval ?? 'month');

        let userId = subscription.metadata?.userId as string | undefined;

        // If metadata doesn't contain userId, resolve via existing subscription, customer in DB, or Stripe customer metadata
        if (!userId) {
          const existing = await prisma.subscription.findFirst({
            where: {
              OR: [{ stripeSubscriptionId }, { stripeCustomerId }],
            },
            select: { userId: true },
          });
          userId = existing?.userId;
        }

        if (!userId && stripeCustomerId) {
          try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (customer && !customer.deleted && (customer as Stripe.Customer).metadata?.userId) {
              userId = (customer as Stripe.Customer).metadata.userId;
            }
          } catch (custErr: any) {
            console.warn(`[Stripe Webhook] Failed to retrieve customer ${stripeCustomerId}:`, custErr?.message);
          }
        }

        if (userId) {
          const { currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } = extractPeriodDates(subscription);

          // If this subscription was previously marked as trial and has become active, graduate to monthly
          const existingSub = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId },
            select: { plan: true },
          });

          let effectivePlan = plan;
          if (existingSub?.plan === 'trial' && status === 'active') {
            effectivePlan = 'monthly';
          }

          await prisma.subscription.upsert({
            where: { stripeSubscriptionId },
            create: {
              userId,
              plan: effectivePlan,
              interval,
              stripeCustomerId,
              stripeSubscriptionId,
              status,
              currentPeriodStart,
              currentPeriodEnd,
              cancelAtPeriodEnd,
            },
            update: {
              status,
              plan: effectivePlan,
              interval,
              stripeCustomerId,
              currentPeriodStart,
              currentPeriodEnd,
              cancelAtPeriodEnd,
            },
          });

          if (status === 'active') {
            await prisma.user.update({
              where: { id: userId },
              data: {
                trialActive: false,
                isPaused: false,
              },
            });
            await prisma.website.updateMany({
              where: { userId },
              data: { contentAutomationEnabled: true },
            });
          } else if (status === 'trialing') {
            const trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : currentPeriodStart;
            const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : currentPeriodEnd;
            await prisma.user.update({
              where: { id: userId },
              data: {
                trialActive: true,
                trialStartedAt: trialStart,
                trialEndsAt: trialEnd,
                isPaused: false,
              },
            });
            await prisma.website.updateMany({
              where: { userId },
              data: { contentAutomationEnabled: true },
            });
          } else if (status === 'past_due' || status === 'unpaid') {
            await prisma.user.update({
              where: { id: userId },
              data: { isPaused: true },
            });
            await prisma.website.updateMany({
              where: { userId },
              data: { contentAutomationEnabled: false },
            });
          }

          console.log(`[Stripe Webhook] Updated subscription ${stripeSubscriptionId} status to "${status}"`);
        } else {
          console.warn(`[Stripe Webhook] Could not resolve userId for subscription ${stripeSubscriptionId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const stripeSubscriptionId = subscription.id as string;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId },
          data: {
            status: 'canceled',
            cancelAtPeriodEnd: true,
          },
        });

        const deletedSub = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId },
          select: { userId: true },
        });

        if (deletedSub?.userId) {
          const remainingActive = await prisma.subscription.findFirst({
            where: {
              userId: deletedSub.userId,
              status: { in: ['active', 'trialing', 'ACTIVE', 'TRIALING'] },
              stripeSubscriptionId: { not: stripeSubscriptionId },
            },
          });
          if (!remainingActive) {
            await prisma.website.updateMany({
              where: { userId: deletedSub.userId },
              data: { contentAutomationEnabled: false },
            });
          }
        }

        console.log(`[Stripe Webhook] Marked subscription ${stripeSubscriptionId} as canceled`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as any;
        const stripeSubscriptionId =
          (invoice.subscription as string) ||
          (invoice.lines?.data?.[0]?.subscription as string) ||
          null;

        if (stripeSubscriptionId) {
          const existingSub = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId },
            select: { id: true, userId: true, plan: true },
          });

          const isGraduatingTrial = existingSub?.plan === 'trial';
          const updatedPlan = isGraduatingTrial ? 'monthly' : (existingSub?.plan || 'monthly');

          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId },
            data: {
              status: 'active',
              plan: updatedPlan,
            },
          });

          const userId = existingSub?.userId;
          if (userId) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                trialActive: false,
                isPaused: false,
              },
            });

            await prisma.website.updateMany({
              where: { userId },
              data: { contentAutomationEnabled: true },
            });
          }

          console.log(`[Stripe Webhook] Invoice paid: confirmed active for subscription ${stripeSubscriptionId}${isGraduatingTrial ? ' (graduated from trial to monthly)' : ''}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const stripeSubscriptionId =
          (invoice.subscription as string) ||
          (invoice.lines?.data?.[0]?.subscription as string) ||
          null;

        if (stripeSubscriptionId) {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId },
            data: {
              status: 'past_due',
            },
          });

          const sub = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId },
            select: { userId: true },
          });

          if (sub?.userId) {
            await prisma.user.update({
              where: { id: sub.userId },
              data: { isPaused: true },
            });

            await prisma.website.updateMany({
              where: { userId: sub.userId },
              data: { contentAutomationEnabled: false },
            });

            await prisma.notification.create({
              data: {
                userId: sub.userId,
                type: 'BILLING',
                title: 'Subscription Payment Failed',
                message:
                  'Your recent subscription payment could not be processed. Please update your payment method in your billing dashboard to restore automatic daily publishing.',
              },
            });
          }

          console.warn(`[Stripe Webhook] Payment failed for subscription ${stripeSubscriptionId}; paused user automation`);
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error(`[Stripe Webhook Handler Error]:`, error?.message || error);
    res.status(500).json({ error: 'Internal Server Error during webhook processing' });
  }
});

export default router;
