/**
 * Authoritative pricing configuration for RankAutonomous.
 *
 * MONTHLY:
 * $149/month (14900 cents)
 *
 * YEARLY:
 * $99/month equivalent billed annually at $1,188/year (118800 cents)
 *
 * ANNUAL SAVINGS:
 * 12 × $149 = $1,788
 * Annual price = $1,188
 * Annual savings = $600/year (60000 cents, $50/month equivalent savings)
 */

export const PRICING_CONFIG = {
  monthly: {
    amountDollars: 149,
    amountCents: 14900,
    interval: 'month' as const,
    display: '$149/month',
  },
  yearly: {
    amountDollars: 1188,
    amountCents: 118800,
    yearlyMonthlyEquivalent: 99,
    interval: 'year' as const,
    display: '$99/month billed annually at $1,188/year',
  },
  savings: {
    annualSavingsDollars: 600,
    annualSavingsCents: 60000,
    monthlySavingsDollars: 50,
  },
} as const;

export type PlanType = 'monthly' | 'annual';
