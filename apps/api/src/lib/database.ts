import { PrismaClient } from '@prisma/client';

/**
 * Resolves the active database connection string.
 * Supports dedicated TEST_DATABASE_URL for isolated testing environments.
 * Falls back to development/production DATABASE_URL.
 */
function resolveDatabaseUrl(): string | undefined {
  const isTest =
    process.env.NODE_ENV === 'test' ||
    process.env.IS_TEST === 'true' ||
    process.env.npm_lifecycle_event === 'test';

  if (isTest && process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  return process.env.DATABASE_URL;
}

const activeUrl = resolveDatabaseUrl();

const prisma = new PrismaClient({
  datasources: activeUrl
    ? {
        db: {
          url: activeUrl,
        },
      }
    : undefined,
});

/**
 * Core application models requiring strict deletion safeguards.
 * Any unscoped deleteMany() on these models will immediately throw,
 * preventing accidental purges of shared development or production data.
 */
const PROTECTED_MODELS = new Set([
  'User',
  'Subscription',
  'Website',
  'SeoAudit',
  'SeoIssue',
  'CrawlJob',
  'PageResult',
  'SeoStrategy',
  'Keyword',
  'Article',
  'BacklinkOpportunity',
  'AiJob',
  'Integration',
  'Notification',
  'AuditLog',
  'AnalyticsSnapshot',
  'SearchPerformanceRecord',
]);

/**
 * Critical Safety Guard Middleware:
 * Intercepts all deleteMany operations on protected models and ensures
 * that a non-empty, valid 'where' clause is present.
 */
prisma.$use(async (params, next) => {
  if (params.action === 'deleteMany') {
    if (params.model && PROTECTED_MODELS.has(params.model)) {
      const where = params.args?.where;
      const hasValidCondition =
        where &&
        typeof where === 'object' &&
        Object.keys(where).length > 0 &&
        Object.values(where).some((val) => val !== undefined);

      if (!hasValidCondition) {
        throw new Error(
          `[CRITICAL DATABASE SAFETY GUARD] Refusing to execute unscoped deleteMany() on model '${params.model}'. ` +
          `Destructive operations on shared development data must be strictly scoped by ID or test identifier.`
        );
      }
    }
  }

  if (params.action === 'delete') {
    if (params.model && PROTECTED_MODELS.has(params.model)) {
      const where = params.args?.where;
      if (!where || typeof where !== 'object' || Object.keys(where).length === 0) {
        throw new Error(
          `[CRITICAL DATABASE SAFETY GUARD] Refusing to execute unscoped delete() on model '${params.model}'. ` +
          `A unique identifier in 'where' is required.`
        );
      }
    }
  }

  return next(params);
});

export default prisma;

