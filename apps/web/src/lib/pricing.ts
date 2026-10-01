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
  annual: {
    amountDollars: 1188,
    amountCents: 118800,
    monthlyEquivalentDollars: 99,
    interval: 'year' as const,
    formattedMonthlyEquivalent: '$99',
    formattedPrice: '$1,188',
    billedNote: '(billed $1,188/year)',
    billedAnnuallyText: 'billed $1,188 annually',
    display: '$99/month billed annually at $1,188/year',
    buttonLabel: 'Subscribe Annually ($1,188/yr)',
    description: 'Billed annually at $1,188/year. Best value for compounding domain growth.',
  },
  savings: {
    annualSavingsDollars: 600,
    monthlySavingsDollars: 50,
    badgeText: 'Save $600 / year',
    badgeTextUpper: 'SAVE $600 / YEAR',
    descriptionText: 'Save $600/year compared to monthly',
  },
} as const;

export type PricingPlan = 'monthly' | 'annual';
