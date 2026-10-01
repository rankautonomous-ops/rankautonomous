const Stripe = require('stripe');

async function setupStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required to run setup_stripe.js');
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: '2022-11-15',
  });

  console.log('Creating RankAutonomous Complete product...');
  const product = await stripe.products.create({
    name: 'RankAutonomous Complete',
    description: 'Complete SEO Automation & Backlink Platform',
  });

  console.log('Creating Monthly Price ($149/month)...');
  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 14900, // $149.00
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  console.log('Creating Annual Price ($1,188/year)...');
  const annualPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 118800, // $1188.00
    currency: 'usd',
    recurring: { interval: 'year' },
  });

  console.log('--- SUCCESS ---');
  console.log('STRIPE_MONTHLY_PRICE_ID=' + monthlyPrice.id);
  console.log('STRIPE_ANNUAL_PRICE_ID=' + annualPrice.id);
}

setupStripe().catch(console.error);
