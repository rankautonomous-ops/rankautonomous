import './lib/env'; // MUST be the first import to configure environment variables before routers
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import prisma from './lib/database';
import userRouter from './routes/user';
import billingRouter from './routes/billing';
import webhookRouter from './routes/webhook';
import websiteRouter from './routes/website';
import backlinksRouter from './routes/backlinks';
import competitorsRouter from './routes/competitors';
import integrationsRouter from './routes/integrations';
import publicRouter from './routes/public';
import supportRouter from './routes/support';
import { isConfigured } from './lib/env';

const app = express();
const port = process.env.PORT || 4000;

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

/**
 * Comprehensive origin validator supporting apex domain, www subdomain,
 * preview deployments, local development, and explicit env overrides.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (!origin) return true;

  const normalized = origin.trim().replace(/\/+$/, '');

  // Exact static allowlist
  const staticOrigins = [
    'https://rankautonomous.com',
    'https://www.rankautonomous.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
  ];

  if (staticOrigins.includes(normalized)) {
    return true;
  }

  // Dynamic environment origins (handles comma-separated lists)
  const envOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.CORS_ORIGIN,
    process.env.APP_URL,
    process.env.STRIPE_APP_URL,
  ].filter(Boolean) as string[];

  for (const envVal of envOrigins) {
    const list = envVal.split(',').map((s) => s.trim().replace(/\/+$/, ''));
    if (list.includes(normalized)) {
      return true;
    }
  }

  // Domain pattern validation (wildcards/subdomains/previews)
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();

    // Any rankautonomous.com subdomain (*.rankautonomous.com)
    if (host === 'rankautonomous.com' || host.endsWith('.rankautonomous.com')) {
      return true;
    }

    // Any Vercel deployment preview (*.vercel.app)
    if (host.endsWith('.vercel.app')) {
      return true;
    }

    // Any Netlify deployment preview (*.netlify.app)
    if (host.endsWith('.netlify.app')) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export const corsOptions: cors.CorsOptions = {
  origin: function (origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    // Return false without throwing an unhandled Error to prevent HTML 500 responses on preflight
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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

import { recommendationsRouter } from './routes/recommendations';
import reportsRouter from './routes/reports';
import cmsRouter from './routes/cms';
import adminRouter from './routes/admin';

app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);
app.use('/api/support', supportRouter);
app.use('/api', userRouter);
app.use('/api/billing', billingRouter);
app.use('/api/websites', websiteRouter);
app.use('/api/websites/:websiteId/recommendations', recommendationsRouter);
app.use('/api/websites/:websiteId/reports', reportsRouter);
app.use('/api/websites', cmsRouter);
app.use('/api/websites/:websiteId', backlinksRouter);
app.use('/api/websites/:websiteId/competitors', competitorsRouter);
app.use('/api/integrations', integrationsRouter);

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'api', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', service: 'api', database: 'disconnected' });
  }
});

// Global JSON error handler guaranteeing API never responds with HTML error pages
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Unhandled Error]:', err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : (err?.status || 500);
  res.status(statusCode).json({
    error: err?.name || 'Internal Server Error',
    message: err?.message || 'An unexpected error occurred.',
  });
});

let server: any = null;
if (process.env.NODE_ENV !== 'test' && !process.argv.some(a => a.includes('test'))) {
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
