import './lib/env'; // MUST be the first import to configure environment variables before routers
import express from 'express';
import cors from 'cors';
import prisma from './lib/database';
import userRouter from './routes/user';
import billingRouter from './routes/billing';
import webhookRouter from './routes/webhook';
import websiteRouter from './routes/website';
import backlinksRouter from './routes/backlinks';
import integrationsRouter from './routes/integrations';
import { isConfigured } from './lib/env';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());

// CRITICAL: Stripe Webhook must receive raw body buffer for signature verification
// This middleware MUST be registered BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use('/api/stripe', webhookRouter);

// Standard JSON body parser for all other REST routes
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    service: 'RankAutonomous API',
    status: 'online',
    endpoints: {
      health: '/health',
      me: '/api/me',
      billing: '/api/billing',
      stripeWebhook: '/api/stripe/webhook',
      websites: '/api/websites',
      integrations: '/api/integrations',
    },
  });
});

app.use('/api', userRouter);
app.use('/api/billing', billingRouter);
app.use('/api/websites', websiteRouter);
app.use('/api/websites/:websiteId', backlinksRouter);
app.use('/api/integrations', integrationsRouter);

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'api', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', service: 'api', database: 'disconnected' });
  }
});

let server: any = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    console.log(`API Server running on port ${port}`);
    console.log(`[Config Status] Stripe Secret Key: ${isConfigured('STRIPE_SECRET_KEY') ? 'Configured' : 'Missing'}`);
    console.log(`[Config Status] Stripe Webhook Secret: ${isConfigured('STRIPE_WEBHOOK_SECRET') ? 'Configured' : 'Missing'}`);
    console.log(`[Config Status] Stripe Monthly Price: ${isConfigured('STRIPE_MONTHLY_PRICE_ID') ? 'Configured' : 'Missing'}`);
    console.log(`[Config Status] Stripe Annual Price: ${isConfigured('STRIPE_ANNUAL_PRICE_ID') ? 'Configured' : 'Missing'}`);
    console.log(`[Config Status] Trigger Secret Key: ${isConfigured('TRIGGER_SECRET_KEY') ? 'Configured' : 'Missing'}`);
    console.log(`[Config Status] Trigger Backlink Verification: ${process.env.USE_TRIGGER_BACKLINK_VERIFICATION === 'true' ? 'Enabled' : 'Disabled'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (server) {
      server.close(async () => {
        console.log('HTTP server closed');
        await prisma.$disconnect();
        process.exit(0);
      });
    }
  });
}

export default app;
