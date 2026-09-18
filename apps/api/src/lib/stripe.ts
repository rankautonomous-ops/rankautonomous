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
    return existingSub.stripeCustomerId;
  }

  // 2. Query Stripe for customer with this email
  const existingCustomers = await stripe.customers.list({
    email: user.email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0].id;
  }

  // 3. Create new customer with internal userId attached in metadata
  const newCustomer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: {
      userId: user.id,
    },
  });

  return newCustomer.id;
}
