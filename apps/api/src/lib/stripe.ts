import './env'; // Ensure environment variables are loaded first
import Stripe from 'stripe';
import prisma from './database';
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
  getStripeMonthlyPriceId,
  getStripeAnnualPriceId,
  getStripeAppUrl,
} from './env';

// Initialize Stripe client with the server-side secret key
const stripeSecretKey = getStripeSecretKey() || 'sk_test_placeholder';

if (!getStripeSecretKey()) {
  console.warn('[Stripe API Client] Warning: STRIPE_SECRET_KEY is not set in environment.');
}

export const stripe = new Stripe(stripeSecretKey, {
  typescript: true,
});

export {
  getStripeSecretKey,
  getStripeWebhookSecret,
  getStripeMonthlyPriceId,
  getStripeAnnualPriceId,
  getStripeAppUrl,
};

// Legacy constant exports for backward compatibility (evaluates dynamically or fallback)
export const STRIPE_APP_URL = getStripeAppUrl();
export const STRIPE_MONTHLY_PRICE_ID = getStripeMonthlyPriceId();
export const STRIPE_ANNUAL_PRICE_ID = getStripeAnnualPriceId();
export const STRIPE_WEBHOOK_SECRET = getStripeWebhookSecret();

export type PlanType = 'monthly' | 'annual';
export { PRICING_CONFIG } from './pricing';

/**
 * Validates and maps a safe plan type to the server-configured Stripe Price ID.
 * Dynamically resolves price IDs to avoid stale module closures.
 */
export function getPriceIdForPlan(plan: string): { priceId: string; interval: 'month' | 'year' } | null {
  const monthlyPriceId = getStripeMonthlyPriceId();
  const annualPriceId = getStripeAnnualPriceId();

  if (plan === 'monthly') {
    if (!monthlyPriceId) return null;
    return {
      priceId: monthlyPriceId,
      interval: 'month',
    };
  }
  if (plan === 'annual') {
    if (!annualPriceId) return null;
    return {
      priceId: annualPriceId,
      interval: 'year',
    };
  }
  return null;
}

/**
 * Resolves or creates a Stripe Customer record for an authenticated user.
 * Validates that the customer exists in the active Stripe account, auto-healing
 * any stale/deleted references or mismatched account IDs.
 */
export async function getOrCreateStripeCustomer(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<string> {
  // 1. Check if user already has an existing subscription record with stripeCustomerId
  const existingSub = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      stripeCustomerId: { not: null },
    },
    select: { stripeCustomerId: true },
  });

  if (existingSub?.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingSub.stripeCustomerId);
      if (customer && !customer.deleted) {
        return customer.id;
      }
    } catch (err: any) {
      console.warn(
        `[Stripe] Stored customer ID "${existingSub.stripeCustomerId}" is invalid on active Stripe account (${err?.message || err}). Clearing stale ID and resolving customer.`
      );
      await prisma.subscription.updateMany({
        where: { userId: user.id, stripeCustomerId: existingSub.stripeCustomerId },
        data: { stripeCustomerId: null },
      });
    }
  }

  // 2. Query Stripe for customer with this email in the active Stripe account
  const existingCustomers = await stripe.customers.list({
    email: user.email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    const customerId = existingCustomers.data[0].id;
    await prisma.subscription.updateMany({
      where: { userId: user.id },
      data: { stripeCustomerId: customerId },
    });
    return customerId;
  }

  // 3. Create new customer with internal userId attached in metadata
  const newCustomer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: {
      userId: user.id,
    },
  });

  await prisma.subscription.updateMany({
    where: { userId: user.id },
    data: { stripeCustomerId: newCustomer.id },
  });

  return newCustomer.id;
}
