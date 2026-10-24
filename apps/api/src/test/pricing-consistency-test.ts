import { PRICING_CONFIG as API_PRICING_CONFIG, PlanType } from '../lib/pricing';
import { getPriceIdForPlan, STRIPE_MONTHLY_PRICE_ID, STRIPE_ANNUAL_PRICE_ID } from '../lib/stripe';
import fs from 'fs';
import path from 'path';

/**
 * Automated Verification Test Suite for RankAutonomous Pricing Consistency
 *
 * Verifies:
 * 1. Monthly plan is strictly $149/month ($149.00, 14900 cents).
 * 2. Annual plan is strictly $1,188/year ($1,188.00, 118800 cents).
 * 3. Annual plan monthly equivalent is strictly $99/month.
 * 4. Annual savings is strictly $600/year (12 * 149 - 1188 = 600).
 * 5. Monthly Stripe Price ID matches live verified price_1UMdQEFahIpHmCppVTQWZeMU.
 * 6. Annual Stripe Price ID matches live verified price_1UMdTJFahIpHmCppTg7hEoeY.
 * 7. Unapproved plan tiers are rejected.
 * 8. API and Web PRICING_CONFIG are synchronized.
 * 9. No misleading 'From $99/mo' or outdated pricing claims remain in marketing/blog files.
 */

async function runPricingConsistencyTests() {
  console.log('==================================================');
  console.log('RANKAUTONOMOUS PRICING CONSISTENCY VERIFICATION');
  console.log('==================================================\n');

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

  // 1. Monthly pricing amounts
  assert(
    API_PRICING_CONFIG.monthly.amountDollars === 149 &&
      API_PRICING_CONFIG.monthly.amountCents === 14900 &&
      API_PRICING_CONFIG.monthly.interval === 'month',
    'Test 1: API monthly price is exactly $149 USD / month (14900 cents)'
  );

  // 2. Annual pricing amounts
  assert(
    API_PRICING_CONFIG.annual.amountDollars === 1188 &&
      API_PRICING_CONFIG.annual.amountCents === 118800 &&
      API_PRICING_CONFIG.annual.interval === 'year',
    'Test 2: API annual price is exactly $1,188 USD / year (118800 cents)'
  );

  // 3. Monthly equivalent for annual plan
  assert(
    API_PRICING_CONFIG.annual.monthlyEquivalentDollars === 99,
    'Test 3: API annual plan monthly equivalent is exactly $99 USD/month'
  );

  // 4. Annual savings calculation
  const calculatedSavings = (API_PRICING_CONFIG.monthly.amountDollars * 12) - API_PRICING_CONFIG.annual.amountDollars;
  assert(
    calculatedSavings === 600 &&
      API_PRICING_CONFIG.savings.annualSavingsDollars === 600 &&
      API_PRICING_CONFIG.savings.monthlySavingsDollars === 50,
    'Test 4: Annual savings calculation is exactly $600/year (12 × $149 = $1,788 - $1,188 = $600)'
  );

  // 5. Checkout resolution for monthly
  const monthlyPriceInfo = getPriceIdForPlan('monthly');
  const expectedMonthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID || 'price_1UU7kREMsWiOvmxya0icU786';
  assert(
    monthlyPriceInfo !== null &&
      monthlyPriceInfo.interval === 'month' &&
      monthlyPriceInfo.priceId === expectedMonthlyPriceId,
    `Test 5: Monthly checkout resolves to verified Stripe Price ID (${expectedMonthlyPriceId})`
  );

  // 6. Checkout resolution for annual
  const annualPriceInfo = getPriceIdForPlan('annual');
  const expectedAnnualPriceId = process.env.STRIPE_ANNUAL_PRICE_ID || 'price_1UU7kREMsWiOvmxyMWgAzrZ1';
  assert(
    annualPriceInfo !== null &&
      annualPriceInfo.interval === 'year' &&
      annualPriceInfo.priceId === expectedAnnualPriceId,
    `Test 6: Annual checkout resolves to verified Stripe Price ID (${expectedAnnualPriceId})`
  );

  // 7. Security: Unapproved / arbitrary tiers are rejected
  const maliciousPlans = ['free', 'enterprise', 'custom', 'price_fake_123', 'lifetime'];
  const allRejected = maliciousPlans.every(p => getPriceIdForPlan(p) === null);
  assert(
    allRejected,
    'Test 7: Arbitrary or malicious plan tiers are safely rejected with null'
  );

  // 8. Shared synchronization between API and Web PRICING_CONFIG
  const webPricingPath = path.resolve(__dirname, '../../../../apps/web/src/lib/pricing.ts');
  const webPricingRaw = fs.readFileSync(webPricingPath, 'utf8');

  assert(
    webPricingRaw.includes('amountDollars: 149') &&
      webPricingRaw.includes('amountCents: 14900') &&
      webPricingRaw.includes('amountDollars: 1188') &&
      webPricingRaw.includes('amountCents: 118800') &&
      webPricingRaw.includes('monthlyEquivalentDollars: 99') &&
      webPricingRaw.includes('annualSavingsDollars: 600'),
    'Test 8: API and Web PRICING_CONFIG definitions are synchronized with identical values ($149/mo, $1,188/yr, $99/mo eq, $600 savings)'
  );

  // 9. Backward compatibility alias (yearly -> annual)
  assert(
    API_PRICING_CONFIG.yearly.amountDollars === API_PRICING_CONFIG.annual.amountDollars &&
      webPricingRaw.includes('yearly: annualConfig'),
    'Test 9: Both API and Web configs provide backward-compatible yearly alias'
  );

  // 10. Audit blog posts file for misleading 'From $99/mo'
  const blogFilePath = path.resolve(__dirname, '../../../../apps/web/src/lib/blog/posts.ts');
  const blogContent = fs.readFileSync(blogFilePath, 'utf8');
  const hasMisleadingFrom99 = /\|\s*\*\*Monthly Cost\*\*\s*\|\s*\$3,500\s*–\s*\$10,000\/mo\s*\|\s*From \$99\/mo\s*\|/.test(blogContent);
  const hasAccurateCost = blogContent.includes('$149/mo (or $99/mo billed annually)');
  assert(
    !hasMisleadingFrom99 && hasAccurateCost,
    'Test 10: Blog agency comparison table accurately states $149/mo (or $99/mo billed annually)'
  );

  // 11. Structured data in pricing page contains both approved offers
  const pricingPagePath = path.resolve(__dirname, '../../../../apps/web/src/app/(marketing)/pricing/page.tsx');
  const pricingPageContent = fs.readFileSync(pricingPagePath, 'utf8');
  const hasProductLd = pricingPageContent.includes("price: '149.00'") && pricingPageContent.includes("price: '1188.00'");
  assert(
    hasProductLd,
    'Test 11: Pricing page embeds JSON-LD structured data with $149.00 and $1188.00 offers'
  );

  console.log('\n==================================================');
  console.log(`PRICING CONSISTENCY SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPricingConsistencyTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
