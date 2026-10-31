/**
 * Authoritative pricing configuration for RankAutonomous.
 *
 * MONTHLY:
 * $149/month
 *
 * YEARLY:
 * $99/month equivalent
 * $1,188/year billed annually
 *
 * ANNUAL SAVINGS:
 * 12 × $149 = $1,788
 * Annual price = $1,188
 * Annual savings = $600/year ($50/month equivalent savings)
 */

const annualConfig = {
  amountDollars: 1188,
  amountCents: 118800,
  monthlyEquivalentDollars: 99,
  yearlyMonthlyEquivalent: 99,
  interval: 'year' as const,
  formattedMonthlyEquivalent: '$99',
  formattedPrice: '$1,188',
  billedNote: '(billed $1,188/year)',
  billedAnnuallyText: 'billed $1,188 annually',
  display: '$99/month billed annually at $1,188/year',
  buttonLabel: 'Subscribe Annually ($1,188/yr)',
  description: 'Billed annually at $1,188/year. Best value for compounding domain growth.',
};

export const PRICING_CONFIG = {
  monthly: {
    amountDollars: 149,
    amountCents: 14900,
    interval: 'month' as const,
    formattedPrice: '$149',
    formattedPeriod: '/ month',
    display: '$149/month',
    buttonLabel: 'Subscribe Monthly ($149/mo)',
    description: 'Flexible monthly subscription. Cancel anytime without lock-in.',
  },
  annual: annualConfig,
  yearly: annualConfig,
  trial: {
    amountDollars: 1,
    amountCents: 100,
    durationDays: 3,
    interval: 'day' as const,
    formattedPrice: '$1',
    subsequentPlan: 'monthly' as const,
    subsequentAmountDollars: 149,
    formattedSubsequentPrice: '$149/month',
    display: '$1 for 3-day trial, then $149/month',
    buttonLabel: 'Try for $1 (3-Day Full Access)',
    disclosureText: '$1.00 for 3 days full access, then automatically renews at $149.00/month unless cancelled in your dashboard before trial ends.',
    description: 'Full access for 3 days for $1. Automatically renews at $149/month unless cancelled before trial ends.',
  },
  savings: {
    annualSavingsDollars: 600,
    annualSavingsCents: 60000,
    monthlySavingsDollars: 50,
    badgeText: 'Save $600 / year',
    badgeTextUpper: 'SAVE $600 / YEAR',
    descriptionText: 'Save $600/year compared to monthly',
  },
} as const;

export type PricingPlan = 'monthly' | 'annual' | 'trial';
export type PlanType = PricingPlan;

