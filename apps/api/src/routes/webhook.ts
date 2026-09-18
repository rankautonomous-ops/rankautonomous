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
    sub.current_period_start ||
    sub.items?.data?.[0]?.current_period_start ||
    sub.created ||
    Math.floor(Date.now() / 1000);

  const endSec =
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

          console.log(`[Stripe Webhook] Synchronized subscription ${stripeSubscriptionId} for user ${userId}`);
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

          await prisma.subscription.upsert({
            where: { stripeSubscriptionId },
            create: {
              userId,
              plan,
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
              plan,
              interval,
              stripeCustomerId,
              currentPeriodStart,
              currentPeriodEnd,
              cancelAtPeriodEnd,
            },
          });
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
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId },
            data: {
              status: 'active',
            },
          });
          console.log(`[Stripe Webhook] Invoice paid: confirmed active for subscription ${stripeSubscriptionId}`);
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
            await prisma.notification.create({
              data: {
                userId: sub.userId,
                type: 'BILLING',
                title: 'Subscription Payment Failed',
                message:
                  'Your recent subscription invoice payment could not be processed. Please update your payment method to avoid service interruption.',
              },
            });
          }

          console.warn(`[Stripe Webhook] Payment failed for subscription ${stripeSubscriptionId}`);
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
