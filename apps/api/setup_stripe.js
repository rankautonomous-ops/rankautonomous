const Stripe = require('stripe');

async function setupStripe() {
  const stripe = new Stripe('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', {
    apiVersion: '2022-11-15',
  });

  console.log('Creating RankAutonomous Complete product...');
  const product = await stripe.products.create({
    name: 'RankAutonomous Complete',
    description: 'Complete SEO Automation & Backlink Platform',
  });

  console.log('Creating Monthly Price ($199/month)...');
  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 19900, // $199.00
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  console.log('Creating Annual Price ($1788/year)...');
  const annualPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 178800, // $1788.00
    currency: 'usd',
    recurring: { interval: 'year' },
  });

  console.log('--- SUCCESS ---');
  console.log('STRIPE_MONTHLY_PRICE_ID=' + monthlyPrice.id);
  console.log('STRIPE_ANNUAL_PRICE_ID=' + annualPrice.id);
}

setupStripe().catch(console.error);
