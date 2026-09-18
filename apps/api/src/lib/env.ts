import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

let isInitialized = false;

/**
 * Robustly loads environment variables from .env files regardless of whether
 * the API is running in dev (ts-node), production (dist/index.js), or from a workspace subfolder.
 */
export function loadEnvironment(forceReload = false): void {
  if (isInitialized && !forceReload) {
    return;
  }

  // Candidate paths where the root .env or local .env file may reside
  const candidatePaths = [
    // 1. Current working directory (e.g. running npm commands from repo root RankAutonomous)
    path.resolve(process.cwd(), '.env'),
    // 2. Up two levels from apps/api (process.cwd() = A:\freelancingg\RankAutonomous\apps\api)
    path.resolve(process.cwd(), '../../.env'),
    // 3. Up one level (e.g. if running in apps/)
    path.resolve(process.cwd(), '../.env'),
    // 4. In apps/api folder
    path.resolve(process.cwd(), 'apps/api/.env'),
    // 5. From __dirname of this file (apps/api/src/lib or apps/api/dist/lib -> 4 levels to root)
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
    }
  }

  // Standard fallback
  dotenv.config({ override: true });

  isInitialized = true;
}

// Automatically load environment on import
loadEnvironment();

/**
 * Checks if a specific environment variable is configured and non-empty.
 */
export function isConfigured(key: string): boolean {
  loadEnvironment();
  const val = process.env[key];
  return Boolean(val && val.trim() !== '');
}

/**
 * Dynamic getters for server-side Stripe environment variables.
 * Using functions ensures values are retrieved dynamically at request time
 * rather than being captured once at initial import time.
 */
export function getStripeSecretKey(): string {
  loadEnvironment();
  return process.env.STRIPE_SECRET_KEY || '';
}

export function getStripeWebhookSecret(): string {
  loadEnvironment();
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

export function getStripeMonthlyPriceId(): string {
  loadEnvironment();
  return process.env.STRIPE_MONTHLY_PRICE_ID || '';
}

export function getStripeAnnualPriceId(): string {
  loadEnvironment();
  return process.env.STRIPE_ANNUAL_PRICE_ID || '';
}

export function getStripeAppUrl(): string {
  loadEnvironment();
  return (
    process.env.STRIPE_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  );
}

export function getApiBaseUrl(): string {
  loadEnvironment();
  return process.env.API_URL || 'http://localhost:4000';
}

export function getAppBaseUrl(): string {
  loadEnvironment();
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
