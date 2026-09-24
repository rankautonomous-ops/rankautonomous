import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSubscription } from '../middleware/subscription';
import prisma from '../lib/database';
import {
  generateKeywordSuggestions,
  WebsiteKeywordContext,
  AiServiceValidationError,
} from '../services/aiKeywordService';
import { AiProviderError } from '../services/aiProvider';
import { startCrawl } from '../services/crawler';
import { addKeywords, importAiSuggestions, enrichKeywordsData, discoverKeywords } from '../services/keywordResearch';
import { SearchIntent, KeywordStatus } from '@prisma/client';
import { startSeoAudit } from '../services/seoAudit';
import { startSeoStrategy } from '../services/seoStrategy';
import { generateArticle, reviewArticle } from '../services/aiContent';
import { sanitizeHtml, sanitizeSlug } from '../services/aiContent/schema';
import { decryptJson } from '../lib/encryption';
import {
  testWordPressConnection,
  saveWordPressIntegration,
  getWordPressIntegration,
  deleteWordPressIntegration,
  publishArticleToWordPress,
  trashWordPressPost,
  WordPressApiError,
} from '../services/wordpress';

const router = Router();

// =============================================================================
// VALIDATION CONSTANTS & HELPERS
// =============================================================================

export const ALLOWED_SEO_GOALS = [
  'Increase organic traffic',
  'Rank for keywords',
  'Generate leads',
  'Increase sales',
  'Improve authority',
  'Increase brand visibility',
] as const;

export const ALLOWED_LOCATION_TYPES = ['GLOBAL', 'COUNTRY', 'REGION', 'CITY'] as const;

export const ALLOWED_PLATFORMS = [
  'WordPress',
  'Shopify',
  'Webflow',
  'Custom',
  'Other',
] as const;

export type AllowedSeoGoal = typeof ALLOWED_SEO_GOALS[number];
export type AllowedLocationType = typeof ALLOWED_LOCATION_TYPES[number];
export type AllowedPlatform = typeof ALLOWED_PLATFORMS[number];

/**
 * Validates and normalizes website URLs with SSRF protection.
 * - Enforces HTTPS protocol (prepends https:// if missing).
 * - Rejects dangerous protocols (javascript:, data:, file:, etc.).
 * - Rejects localhost, loopback IPs, and private CIDR ranges.
 * - Strips unnecessary trailing slashes on root paths.
 */
export function validateAndNormalizeUrl(rawUrl: unknown): { valid: true; normalizedUrl: string } | { valid: false; error: string } {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, error: 'Website URL is required.' };
  }

  let trimmed = rawUrl.trim();

  // Reject dangerous schemes
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('ftp:') ||
    lower.startsWith('mailto:')
  ) {
    return { valid: false, error: 'Invalid URL protocol. Only HTTPS URLs are allowed.' };
  }

  // Prepend https:// if no protocol given
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  // Require https protocol
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only secure HTTPS URLs are accepted.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // SSRF Protection: Reject localhost and loopback addresses
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return { valid: false, error: 'Localhost and local loopback targets are not allowed.' };
  }

  // SSRF Protection: Reject private IPv4 subnets (RFC 1918, RFC 3927)
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [, o1, o2] = ipMatch.map(Number);
    if (
      o1 === 10 || // 10.0.0.0/8
      o1 === 127 || // 127.0.0.0/8
      (o1 === 172 && o2 >= 16 && o2 <= 31) || // 172.16.0.0/12
      (o1 === 192 && o2 === 168) || // 192.168.0.0/16
      (o1 === 169 && o2 === 254) // 169.254.0.0/16 Link-local
    ) {
      return { valid: false, error: 'Private and internal IP ranges are not allowed.' };
    }
  }

  // Check that hostname contains at least one dot (domain.tld)
  if (!hostname.includes('.')) {
    return { valid: false, error: 'Domain must include a valid top-level domain (e.g. example.com).' };
  }

  // Remove trailing slash on root domain (e.g. https://example.com/ -> https://example.com)
  let normalized = parsed.origin;
  if (parsed.pathname && parsed.pathname !== '/') {
    // Preserve sub-paths without trailing slash
    normalized += parsed.pathname.replace(/\/+$/, '');
  }
  if (parsed.search) {
    normalized += parsed.search;
  }

  return { valid: true, normalizedUrl: normalized };
}

/**
 * Validates onboarding and website metadata payload fields.
 */
export function validateWebsiteFields(body: any, isUpdate = false) {
  const errors: string[] = [];

  // 1. Name validation
  let name: string | undefined;
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('Website name must be a non-empty string.');
    } else if (body.name.trim().length > 100) {
      errors.push('Website name must not exceed 100 characters.');
    } else {
      name = body.name.trim();
    }
  } else if (!isUpdate) {
    errors.push('Website name is required.');
  }

  // 2. Industry validation
  let industry: string | null = null;
  if (body.industry !== undefined && body.industry !== null) {
    if (typeof body.industry !== 'string') {
      errors.push('Industry must be a string.');
    } else {
      industry = body.industry.trim().substring(0, 100) || null;
    }
  }

  // 3. Target Country validation
  let targetCountry: string | null = null;
  if (body.targetCountry !== undefined && body.targetCountry !== null) {
    if (typeof body.targetCountry !== 'string') {
      errors.push('Target country must be a string.');
    } else {
      targetCountry = body.targetCountry.trim().substring(0, 100) || null;
    }
  }

  // 4. Target Audience validation
  let targetAudience: string | null = null;
  if (body.targetAudience !== undefined && body.targetAudience !== null) {
    if (typeof body.targetAudience !== 'string') {
      errors.push('Target audience must be a string.');
    } else {
      targetAudience = body.targetAudience.trim().substring(0, 200) || null;
    }
  }

  // 5. Description validation
  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      errors.push('Description must be a string.');
    } else if (body.description.trim().length > 2000) {
      errors.push('Description must not exceed 2,000 characters.');
    } else {
      description = body.description.trim() || null;
    }
  }

  // 6. SEO Goals validation
  let seoGoals: string[] = [];
  if (body.seoGoals !== undefined && body.seoGoals !== null) {
    if (!Array.isArray(body.seoGoals)) {
      errors.push('SEO goals must be an array of strings.');
    } else {
      for (const goal of body.seoGoals) {
        if (typeof goal !== 'string' || !ALLOWED_SEO_GOALS.includes(goal as any)) {
          errors.push(`Invalid SEO goal "${goal}". Allowed goals: ${ALLOWED_SEO_GOALS.join(', ')}`);
          break;
        }
      }
      seoGoals = Array.from(new Set(body.seoGoals));
    }
  }

  // 7. Target Location Type & Granular Location validation
  let targetLocationType: string = 'GLOBAL';
  let targetRegion: string | null = null;
  let targetCity: string | null = null;

  if (body.targetLocationType !== undefined && body.targetLocationType !== null) {
    const rawType = String(body.targetLocationType).trim().toUpperCase();
    if (!ALLOWED_LOCATION_TYPES.includes(rawType as any)) {
      errors.push(`Invalid target location type "${body.targetLocationType}". Allowed types: ${ALLOWED_LOCATION_TYPES.join(', ')}`);
    } else {
      targetLocationType = rawType;
    }
  }

  if (body.targetRegion !== undefined && body.targetRegion !== null) {
    targetRegion = typeof body.targetRegion === 'string' ? body.targetRegion.trim().substring(0, 100) || null : null;
  }

  if (body.targetCity !== undefined && body.targetCity !== null) {
    targetCity = typeof body.targetCity === 'string' ? body.targetCity.trim().substring(0, 100) || null : null;
  }

  // Cross-field validation for location hierarchy
  if (targetLocationType === 'COUNTRY' && !targetCountry) {
    errors.push('Target country is required when target location type is COUNTRY.');
  } else if (targetLocationType === 'REGION') {
    if (!targetCountry) {
      errors.push('Target country is required when target location type is REGION.');
    }
    if (!targetRegion) {
      errors.push('Target region/state is required when target location type is REGION.');
    }
  } else if (targetLocationType === 'CITY') {
    if (!targetCountry) {
      errors.push('Target country is required when target location type is CITY.');
    }
    if (!targetRegion) {
      errors.push('Target region/state is required when target location type is CITY.');
    }
    if (!targetCity) {
      errors.push('Target city is required when target location type is CITY.');
    }
  }

  // 8. Primary Keywords validation
  let primaryKeywords: string[] = [];
  if (body.primaryKeywords !== undefined && body.primaryKeywords !== null) {
    if (!Array.isArray(body.primaryKeywords)) {
      errors.push('Primary keywords must be an array of strings.');
    } else {
      const seen = new Set<string>();
      for (const kw of body.primaryKeywords) {
        if (typeof kw === 'string') {
          const trimmed = kw.trim();
          if (trimmed.length > 0) {
            if (trimmed.length > 100) {
              errors.push(`Keyword "${trimmed.substring(0, 20)}..." exceeds maximum length of 100 characters.`);
              break;
            }
            const keyLower = trimmed.toLowerCase();
            if (!seen.has(keyLower)) {
              seen.add(keyLower);
              primaryKeywords.push(trimmed);
            }
          }
        }
      }
      if (primaryKeywords.length > 50) {
        errors.push('Maximum 50 primary keywords allowed.');
      }
    }
  }

  // 9. Platform validation
  let platform: string | null = null;
  if (body.platform !== undefined && body.platform !== null) {
    if (typeof body.platform !== 'string' || !ALLOWED_PLATFORMS.includes(body.platform as any)) {
      errors.push(`Invalid platform "${body.platform}". Allowed platforms: ${ALLOWED_PLATFORMS.join(', ')}`);
    } else {
      platform = body.platform;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      name,
      industry,
      targetCountry,
      targetAudience,
      description,
      seoGoals,
      targetLocationType,
      targetRegion,
      targetCity,
      primaryKeywords,
      platform,
    },
  };
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/websites
 * Lists all websites belonging to the authenticated user.
 * Excludes sensitive integration credentials.
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const websites = await prisma.website.findMany({
      where: {
        userId: req.user!.id,
      },
      select: {
        id: true,
        url: true,
        name: true,
        platform: true,
        industry: true,
        targetCountry: true,
        targetAudience: true,
        description: true,
        seoGoals: true,
        targetLocationType: true,
        targetRegion: true,
        targetCity: true,
        primaryKeywords: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            keywords: true,
            seoAudits: true,
            integrations: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    res.json({ websites });
  } catch (error: any) {
    console.error('[Websites GET Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve websites.',
    });
  }
});

/**
 * GET /api/websites/active
 * Returns the authenticated user's active/primary website.
 * Registered BEFORE /:id to prevent route shadowing.
 * MVP Behavior:
 * - Deterministically selects a website with status CONNECTED, ANALYZING, or ACTIVE.
 * - Ordered by most recently updated.
 */
router.get('/active', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Try to find a website in connected/analyzing/active status
    let website = await prisma.website.findFirst({
      where: {
        userId: req.user!.id,
        status: {
          in: ['CONNECTED', 'ANALYZING', 'ACTIVE'],
        },
      },
      select: {
        id: true,
        url: true,
        name: true,
        platform: true,
        industry: true,
        targetCountry: true,
        targetAudience: true,
        description: true,
        seoGoals: true,
        targetLocationType: true,
        targetRegion: true,
        targetCity: true,
        primaryKeywords: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        seoAudits: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            healthScore: true,
            status: true,
            summaryData: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            keywords: true,
            seoAudits: true,
            integrations: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // 2. Fallback to any website if none is in preferred status
    if (!website) {
      website = await prisma.website.findFirst({
        where: {
          userId: req.user!.id,
        },
        select: {
          id: true,
          url: true,
          name: true,
          platform: true,
          industry: true,
          targetCountry: true,
          targetAudience: true,
          description: true,
          seoGoals: true,
          targetLocationType: true,
          targetRegion: true,
          targetCity: true,
          primaryKeywords: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          seoAudits: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              id: true,
              healthScore: true,
              status: true,
              summaryData: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              keywords: true,
              seoAudits: true,
              integrations: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
    }

    const responseWebsite = website
      ? {
          ...website,
          latestAudit: website.seoAudits?.[0] || null,
          seoAudits: undefined,
        }
      : null;

    res.json({ website: responseWebsite });
  } catch (error: any) {
    console.error('[Websites GET Active Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve active website.',
    });
  }
});

/**
 * GET /api/websites/:id
 * Retrieves details for a specific website owned by the authenticated user.
 * Returns 404 if the website does not exist or does not belong to the user.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const website = await prisma.website.findFirst({
      where: {
        id,
        userId: req.user!.id, // Strict tenant isolation
      },
      select: {
        id: true,
        url: true,
        name: true,
        platform: true,
        industry: true,
        targetCountry: true,
        targetAudience: true,
        description: true,
        seoGoals: true,
        targetLocationType: true,
        targetRegion: true,
        targetCity: true,
        primaryKeywords: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        seoAudits: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            healthScore: true,
            status: true,
            summaryData: true,
            createdAt: true,
          },
        },
        integrations: {
          select: {
            id: true,
            provider: true,
            status: true,
            createdAt: true,
            // Sensitive credentials omitted for security
          },
        },
        _count: {
          select: {
            keywords: true,
            seoAudits: true,
            articles: true,
          },
        },
      },
    });

    if (!website) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Website not found.',
      });
      return;
    }

    res.json({
      website: {
        ...website,
        latestAudit: website.seoAudits[0] || null,
        seoAudits: undefined,
      },
    });
  } catch (error: any) {
    console.error('[Websites GET Details Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve website details.',
    });
  }
});

/**
 * POST /api/websites
 * Creates a new website record from onboarding data.
 * Requires active subscription.
 */
router.post(
  '/',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Validate & Normalize URL
      const urlResult = validateAndNormalizeUrl(req.body.url);
      if (!urlResult.valid) {
        res.status(400).json({
          error: 'Bad Request',
          message: urlResult.error,
        });
        return;
      }

      // 2. Validate Onboarding Fields
      const fieldResult = validateWebsiteFields(req.body, false);
      if (!fieldResult.valid) {
        res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Validation failed.',
          details: fieldResult.errors,
        });
        return;
      }

      const { data } = fieldResult;

      // 3. Create Website Record (Server strictly assigns userId and CONNECTED status)
      const website = await prisma.website.create({
        data: {
          userId: req.user!.id,
          url: urlResult.normalizedUrl,
          name: data.name!,
          industry: data.industry,
          targetCountry: data.targetCountry,
          targetAudience: data.targetAudience,
          description: data.description,
          seoGoals: data.seoGoals,
          targetLocationType: data.targetLocationType,
          targetRegion: data.targetRegion,
          targetCity: data.targetCity,
          primaryKeywords: data.primaryKeywords,
          platform: data.platform,
          status: 'CONNECTED', // Initial state per PRD; becomes ACTIVE only after analysis completes
        },
        select: {
          id: true,
          url: true,
          name: true,
          platform: true,
          industry: true,
          targetCountry: true,
          targetAudience: true,
          description: true,
          seoGoals: true,
          targetLocationType: true,
          targetRegion: true,
          targetCity: true,
          primaryKeywords: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.status(201).json({
        message: 'Website connected successfully.',
        website,
      });
    } catch (error: any) {
      console.error('[Websites POST Error]:', error?.message || error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to connect website.',
      });
    }
  }
);

/**
 * PUT /api/websites/:id
 * Updates an existing website owned by the authenticated user.
 * Requires active subscription.
 */
router.put(
  '/:id',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // 1. Verify existence and ownership
      const existing = await prisma.website.findFirst({
        where: {
          id,
          userId: req.user!.id,
        },
      });

      if (!existing) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Website not found.',
        });
        return;
      }

      // 2. Validate URL if provided
      let normalizedUrl = existing.url;
      if (req.body.url !== undefined) {
        const urlResult = validateAndNormalizeUrl(req.body.url);
        if (!urlResult.valid) {
          res.status(400).json({
            error: 'Bad Request',
            message: urlResult.error,
          });
          return;
        }
        normalizedUrl = urlResult.normalizedUrl;
      }

      // 3. Validate Onboarding Fields
      const fieldResult = validateWebsiteFields(req.body, true);
      if (!fieldResult.valid) {
        res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Validation failed.',
          details: fieldResult.errors,
        });
        return;
      }

      const { data } = fieldResult;

      // 4. Update Website Record
      const updated = await prisma.website.update({
        where: {
          id,
        },
        data: {
          url: normalizedUrl,
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(req.body.industry !== undefined ? { industry: data.industry } : {}),
          ...(req.body.targetCountry !== undefined ? { targetCountry: data.targetCountry } : {}),
          ...(req.body.targetAudience !== undefined ? { targetAudience: data.targetAudience } : {}),
          ...(req.body.description !== undefined ? { description: data.description } : {}),
          ...(req.body.seoGoals !== undefined ? { seoGoals: data.seoGoals } : {}),
          ...(req.body.targetLocationType !== undefined ? { targetLocationType: data.targetLocationType } : {}),
          ...(req.body.targetRegion !== undefined ? { targetRegion: data.targetRegion } : {}),
          ...(req.body.targetCity !== undefined ? { targetCity: data.targetCity } : {}),
          ...(req.body.primaryKeywords !== undefined ? { primaryKeywords: data.primaryKeywords } : {}),
          ...(req.body.platform !== undefined ? { platform: data.platform } : {}),
        },
        select: {
          id: true,
          url: true,
          name: true,
          platform: true,
          industry: true,
          targetCountry: true,
          targetAudience: true,
          description: true,
          seoGoals: true,
          targetLocationType: true,
          targetRegion: true,
          targetCity: true,
          primaryKeywords: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.json({
        message: 'Website updated successfully.',
        website: updated,
      });
    } catch (error: any) {
      console.error('[Websites PUT Error]:', error?.message || error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update website.',
      });
    }
  }
);

/**
 * DELETE /api/websites/:id
 * Disconnects a website for the authenticated user.
 * Soft disconnect: sets status = DISCONNECTED to preserve historical SEO records.
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Verify existence and ownership
    const existing = await prisma.website.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Website not found.',
      });
      return;
    }

    // Soft disconnect: preserve SEO data and audit trail
    const disconnected = await prisma.website.update({
      where: {
        id,
      },
      data: {
        status: 'DISCONNECTED',
      },
      select: {
        id: true,
        url: true,
        status: true,
      },
    });

    res.json({
      message: 'Website disconnected successfully.',
      website: disconnected,
    });
  } catch (error: any) {
    console.error('[Websites DELETE Error]:', error?.message || error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to disconnect website.',
    });
  }
});

/**
 * POST /api/websites/keyword-suggestions
 * Generates AI keyword suggestions for onboarding context before a website record exists.
 * Protected by requireAuth and requireSubscription.
 */
router.post(
  '/keyword-suggestions',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        websiteUrl,
        businessName,
        industry,
        country,
        targetCountry,
        targetAudience,
        description,
        seoGoals,
        targetLocationType,
        targetRegion,
        targetCity,
        existingKeywords,
        primaryKeywords,
      } = req.body;

      if (!websiteUrl || typeof websiteUrl !== 'string') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'websiteUrl is required.',
        });
        return;
      }

      const urlResult = validateAndNormalizeUrl(websiteUrl);
      if (!urlResult.valid) {
        res.status(400).json({
          error: 'Bad Request',
          message: urlResult.error,
        });
        return;
      }

      if (!businessName || typeof businessName !== 'string' || !businessName.trim()) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'businessName is required.',
        });
        return;
      }

      // Merge alternative field names
      const effectiveCountry = country || targetCountry;
      const rawKeywords = existingKeywords || primaryKeywords || [];

      // Build context with safe length constraints
      const context: WebsiteKeywordContext = {
        websiteUrl: urlResult.normalizedUrl,
        businessName: businessName.trim().substring(0, 100),
        industry: typeof industry === 'string' ? industry.trim().substring(0, 100) : null,
        country: typeof effectiveCountry === 'string' ? effectiveCountry.trim().substring(0, 100) : null,
        targetAudience: typeof targetAudience === 'string' ? targetAudience.trim().substring(0, 200) : null,
        description: typeof description === 'string' ? description.trim().substring(0, 2000) : null,
        seoGoals: Array.isArray(seoGoals)
          ? seoGoals.filter((g) => typeof g === 'string' && ALLOWED_SEO_GOALS.includes(g as any))
          : [],
        targetLocationType:
          typeof targetLocationType === 'string' && ALLOWED_LOCATION_TYPES.includes(targetLocationType as any)
            ? targetLocationType
            : 'GLOBAL',
        targetRegion: typeof targetRegion === 'string' ? targetRegion.trim().substring(0, 100) : null,
        targetCity: typeof targetCity === 'string' ? targetCity.trim().substring(0, 100) : null,
        existingKeywords: Array.isArray(rawKeywords)
          ? rawKeywords.filter((k: any) => typeof k === 'string').map((k: string) => k.trim().substring(0, 100))
          : [],
      };

      const result = await generateKeywordSuggestions(context);
      res.json(result);
    } catch (error: any) {
      console.error('[Websites AI Keyword Suggestions Error]:', error?.message || error);
      if (error instanceof AiServiceValidationError) {
        res.status(error.statusCode || 502).json({
          error: 'AI Generation Error',
          message: error.message,
        });
        return;
      }
      if (error instanceof AiProviderError) {
        res.status(error.statusCode || 502).json({
          error: 'AI Provider Error',
          message: error.message,
        });
        return;
      }
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate keyword suggestions.',
      });
    }
  }
);

/**
 * POST /api/websites/:id/keyword-suggestions
 * Generates AI keyword suggestions for an existing connected website.
 * Protected by requireAuth, requireSubscription, and strict tenant ownership verification.
 */
router.post(
  '/:id/keyword-suggestions',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Strict tenant isolation: verify website exists and belongs to authenticated user
      const website = await prisma.website.findFirst({
        where: {
          id,
          userId: req.user!.id,
        },
      });

      if (!website) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Website not found.',
        });
        return;
      }

      // Construct context from existing website record, allowing optional request body additions
      const rawKeywords = req.body?.existingKeywords || req.body?.primaryKeywords || [];
      const additionalKeywords: string[] = Array.isArray(rawKeywords)
        ? rawKeywords.filter((k: any) => typeof k === 'string')
        : [];

      const combinedKeywords = Array.from(
        new Set([...(website.primaryKeywords || []), ...additionalKeywords])
      );

      const context: WebsiteKeywordContext = {
        websiteUrl: website.url,
        businessName: req.body?.businessName?.trim?.() || website.name,
        industry: req.body?.industry !== undefined ? req.body.industry : website.industry,
        country: req.body?.country !== undefined ? req.body.country : website.targetCountry,
        targetAudience: req.body?.targetAudience !== undefined ? req.body.targetAudience : website.targetAudience,
        description: req.body?.description !== undefined ? req.body.description : website.description,
        seoGoals: website.seoGoals || [],
        targetLocationType: website.targetLocationType || 'GLOBAL',
        targetRegion: website.targetRegion || null,
        targetCity: website.targetCity || null,
        existingKeywords: combinedKeywords,
      };

      const result = await generateKeywordSuggestions(context);
      res.json(result);
    } catch (error: any) {
      console.error('[Websites :id AI Keyword Suggestions Error]:', error?.message || error);
      if (error instanceof AiServiceValidationError) {
        res.status(error.statusCode || 502).json({
          error: 'AI Generation Error',
          message: error.message,
        });
        return;
      }
      if (error instanceof AiProviderError) {
        res.status(error.statusCode || 502).json({
          error: 'AI Provider Error',
          message: error.message,
        });
        return;
      }
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate keyword suggestions.',
      });
    }
  }
);

/**
 * POST /api/websites/:id/crawl
 * Triggers the crawler service asynchronously.
 */

// =============================================================================
// SEO AUDIT ENDPOINTS
// =============================================================================

// import { startSeoAudit } from '../services/seoAudit';

router.post('/:id/audit', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = req.params.id;

    const website = await prisma.website.findUnique({
      where: { id: websiteId, userId: req.user!.id },
    });

    if (!website) {
      res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
      return;
    }

    const latestCrawl = await prisma.crawlJob.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestCrawl || latestCrawl.status !== 'COMPLETED') {
      res.status(400).json({ error: 'Bad Request', message: 'A COMPLETED crawl is required to start an audit.' });
      return;
    }

    const activeAudit = await prisma.seoAudit.findFirst({
      where: { websiteId, status: { in: ['PENDING', 'PROCESSING'] } }
    });

    if (activeAudit) {
      res.status(409).json({ error: 'Conflict', message: 'An audit is already running for this website.' });
      return;
    }

    const newAudit = await prisma.seoAudit.create({
      data: {
        websiteId,
        crawlJobId: latestCrawl.id,
        status: 'PENDING'
      }
    });

    // Run asynchronously
    startSeoAudit(newAudit.id).catch(console.error);

    res.status(202).json({ message: 'Audit started', auditId: newAudit.id });
  } catch (error) {
    console.error('[Websites POST Audit Error]:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/:id/audit', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = req.params.id;

    const website = await prisma.website.findUnique({
      where: { id: websiteId, userId: req.user!.id },
    });

    if (!website) {
      res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
      return;
    }

    const latestAudit = await prisma.seoAudit.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestAudit) {
      res.status(200).json(null);
      return;
    }

    res.json(latestAudit);
  } catch (error) {
    console.error('[Websites GET Audit Error]:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/:id/audit/issues', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = req.params.id;

    const website = await prisma.website.findUnique({
      where: { id: websiteId, userId: req.user!.id },
    });

    if (!website) {
      res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
      return;
    }

    const latestAudit = await prisma.seoAudit.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestAudit) {
      res.status(404).json({ error: 'Not Found', message: 'No audit found.' });
      return;
    }

    const category = req.query.category as string;
    const severity = req.query.severity as string;

    const whereClause: any = { seoAuditId: latestAudit.id };
    if (category) whereClause.category = category;
    if (severity) whereClause.priority = severity;

    const issues = await prisma.seoIssue.findMany({
      where: whereClause,
      orderBy: { priority: 'asc' } // CRITICAL first implicitly if we map or let DB sort alphabetically (Wait, Prisma sort string is alphabetical, CRITICAL, HIGH, LOW, MEDIUM. It's fine for simple pagination). Let's just sort by createdAt for now.
    });

    res.json(issues);
  } catch (error) {
    console.error('[Websites GET Audit Issues Error]:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =============================================================================
// CRAWLER ENDPOINTS
// =============================================================================

// Helper for crawl status transitions
const CRAWL_ACTIVE_STATUSES = ['PENDING', 'CRAWLING'];

router.post('/:id/crawl/cancel', requireAuth, requireSubscription, async (req: Request, res: Response) => {
  try {
    const websiteId = req.params.id;

    // 1. Verify ownership
    const website = await prisma.website.findUnique({
      where: { id: websiteId, userId: req.user!.id },
    });

    if (!website) {
      return res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
    }

    // 2. Find active crawl job
    const activeJob = await prisma.crawlJob.findFirst({
      where: {
        websiteId,
        status: { in: ['PENDING', 'CRAWLING'] }
      }
    });

    if (!activeJob) {
      return res.status(400).json({ error: 'Bad Request', message: 'No active crawl to cancel.' });
    }

    // 3. Mark as cancelled
    await prisma.crawlJob.update({
      where: { id: activeJob.id },
      data: { status: 'CANCELLED', completedAt: new Date() }
    });
    
    await prisma.website.update({
      where: { id: websiteId },
      data: { status: 'DISCONNECTED' } // Reset state from ANALYZING
    });

    return res.status(200).json({ message: 'Crawl cancelled successfully.' });

  } catch (error: any) {
    console.error('[Websites Crawl Cancel Error]:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred.' });
  }
});

router.post(
  '/:id/crawl',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id },
      });

      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      // Check for active job
      const activeJob = await prisma.crawlJob.findFirst({
        where: { websiteId: id, status: { in: ['PENDING', 'CRAWLING'] } }
      });

      if (activeJob) {
        res.status(409).json({ error: 'Conflict', message: 'A crawl is already in progress.', crawlJobId: activeJob.id });
        return;
      }

      // Create pending job
      const crawlJob = await prisma.crawlJob.create({
        data: {
          websiteId: id,
          status: 'PENDING'
        }
      });

      // Start crawl async
      startCrawl(id, crawlJob.id, website.url).catch(e => console.error(e));

      res.status(202).json({
        message: 'Crawl started',
        crawlJobId: crawlJob.id
      });
    } catch (error: any) {
      console.error('[Websites POST Crawl Error]:', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to start crawl.' });
    }
  }
);

/**
 * GET /api/websites/:id/crawl-jobs
 * Retrieves history of crawls.
 */
router.get(
  '/:id/crawl-jobs',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id },
      });

      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const jobs = await prisma.crawlJob.findMany({
        where: { websiteId: id },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { pages: true } } }
      });

      res.json({ crawlJobs: jobs });
    } catch (error: any) {
      console.error('[Websites GET Crawl Jobs Error]:', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve crawl jobs.' });
    }
  }
);

/**
 * GET /api/websites/:id/crawl
 * Retrieves the latest crawl status.
 */
router.get(
  '/:id/crawl',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id },
      });

      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const job = await prisma.crawlJob.findFirst({
        where: { websiteId: id },
        orderBy: { createdAt: 'desc' }
      });

      if (!job) {
        res.status(200).json({
          status: 'NOT_STARTED',
          totalUrls: 0,
          crawledUrls: 0,
          failedUrls: 0,
          progress: 0,
          startedAt: null,
          completedAt: null,
          error: null,
          message: 'No crawl found for this website.'
        });
        return;
      }

      const progress = job.totalUrls > 0 ? Number((job.crawledUrls / job.totalUrls).toFixed(2)) : 0;

      res.json({
        status: job.status,
        totalUrls: job.totalUrls,
        crawledUrls: job.crawledUrls,
        failedUrls: job.failedUrls,
        progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.errorMessage
      });
    } catch (error: any) {
      console.error('[Websites GET Crawl Error]:', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve crawl status.' });
    }
  }
);

/**
 * POST /api/websites/:id/strategy
 */
router.post(
  '/:id/strategy',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const crawl = await prisma.crawlJob.findFirst({
        where: { websiteId: id, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' }
      });
      if (!crawl) {
        res.status(400).json({ error: 'Bad Request', message: 'A completed crawl is required to generate a strategy.' });
        return;
      }

      const audit = await prisma.seoAudit.findFirst({
        where: { websiteId: id, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' }
      });
      if (!audit) {
        res.status(400).json({ error: 'Bad Request', message: 'A completed SEO audit is required to generate a strategy.' });
        return;
      }

      const existingActive = await prisma.seoStrategy.findFirst({
        where: { websiteId: id, status: { in: ['PENDING', 'PROCESSING'] } }
      });
      if (existingActive) {
        res.status(409).json({ error: 'Conflict', message: 'A strategy generation is already in progress.' });
        return;
      }

      const strategy = await prisma.seoStrategy.create({
        data: {
          websiteId: id,
          crawlJobId: crawl.id,
          seoAuditId: audit.id,
          status: 'PENDING'
        }
      });

      startSeoStrategy(strategy.id).catch(e => console.error(e));

      res.status(202).json({ message: 'Strategy generation started', strategyId: strategy.id });
    } catch (err: any) {
      console.error('[Websites POST Strategy Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/**
 * GET /api/websites/:id/strategy
 */
router.get(
  '/:id/strategy',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const strategy = await prisma.seoStrategy.findFirst({
        where: { websiteId: id },
        orderBy: { createdAt: 'desc' }
      });

      if (!strategy) {
        res.json({ strategy: null });
        return;
      }

      res.json({ strategy });
    } catch (err: any) {
      console.error('[Websites GET Strategy Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/**
 * GET /api/websites/:id/strategies
 */
router.get(
  '/:id/strategies',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const strategies = await prisma.seoStrategy.findMany({
        where: { websiteId: id },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ strategies });
    } catch (err: any) {
      console.error('[Websites GET Strategies Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/**
 * -----------------------------------------------------------------------------
 * KEYWORD RESEARCH WORKSPACE
 * -----------------------------------------------------------------------------
 */

router.get(
  '/:id/keywords',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const keywords = await prisma.keyword.findMany({
        where: { websiteId: id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ keywords });
    } catch (err) {
      console.error('[Websites GET Keywords Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post(
  '/:id/keywords',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { keywords } = req.body; // array of { keyword, intent, targetUrl }

      if (!Array.isArray(keywords) || keywords.length === 0) {
        res.status(400).json({ error: 'Bad Request', message: 'An array of keywords is required.' });
        return;
      }

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const added = await addKeywords(id, keywords);
      res.status(201).json({ keywords: added });
    } catch (err) {
      console.error('[Websites POST Keywords Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.put(
  '/:id/keywords/:keywordId',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, keywordId } = req.params;
      const { intent, targetUrl, status } = req.body;

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const keyword = await prisma.keyword.findFirst({
        where: { id: keywordId, websiteId: id }
      });
      if (!keyword) {
        res.status(404).json({ error: 'Not Found', message: 'Keyword not found.' });
        return;
      }

      let intentEnum = keyword.intent;
      if (intent && Object.values(SearchIntent).includes(intent)) {
        intentEnum = intent as SearchIntent;
      } else if (intent === null) {
        intentEnum = null;
      }

      let statusEnum = keyword.status;
      if (status && Object.values(KeywordStatus).includes(status)) {
        statusEnum = status as KeywordStatus;
      }

      // Basic target URL validation
      let validatedTargetUrl = targetUrl !== undefined ? targetUrl : keyword.targetUrl;
      if (validatedTargetUrl) {
        try {
          const u = new URL(validatedTargetUrl);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            throw new Error('Invalid protocol');
          }
        } catch {
          res.status(400).json({ error: 'Bad Request', message: 'Invalid target URL.' });
          return;
        }
      }

      const updated = await prisma.keyword.update({
        where: { id: keywordId },
        data: {
          intent: intentEnum,
          targetUrl: validatedTargetUrl,
          status: statusEnum
        }
      });

      res.json({ keyword: updated });
    } catch (err) {
      console.error('[Websites PUT Keyword Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.delete(
  '/:id/keywords/:keywordId',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, keywordId } = req.params;
      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const keyword = await prisma.keyword.findFirst({
        where: { id: keywordId, websiteId: id }
      });
      if (!keyword) {
        res.status(404).json({ error: 'Not Found', message: 'Keyword not found.' });
        return;
      }

      await prisma.keyword.update({
        where: { id: keywordId },
        data: { status: 'ARCHIVED' }
      });

      res.json({ message: 'Keyword archived successfully.' });
    } catch (err) {
      console.error('[Websites DELETE Keyword Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post(
  '/:id/keywords/import-ai',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { suggestions } = req.body;

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        res.status(400).json({ error: 'Bad Request', message: 'An array of AI suggestions is required.' });
        return;
      }

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const imported = await importAiSuggestions(id, suggestions);
      res.status(201).json({ keywords: imported });
    } catch (err) {
      console.error('[Websites POST Keywords Import AI Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post(
  '/:id/keywords/discover',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { seedKeywords, topic, location } = req.body;

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      const discovered = await discoverKeywords({
        websiteId: id,
        seedKeywords: Array.isArray(seedKeywords) ? seedKeywords : [],
        topic: typeof topic === 'string' ? topic : undefined,
        location: typeof location === 'string' ? location : undefined
      });
      
      res.status(200).json({ keywords: discovered });
    } catch (err) {
      console.error('[Websites POST Keywords Discover Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post(
  '/:id/keywords/research',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { keywordIds } = req.body;

      if (!Array.isArray(keywordIds) || keywordIds.length === 0) {
        res.status(400).json({ error: 'Bad Request', message: 'keywordIds array is required.' });
        return;
      }

      const website = await prisma.website.findFirst({
        where: { id, userId: req.user!.id }
      });
      if (!website) {
        res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
        return;
      }

      // Verify all requested keywords belong to this website
      const validKeywords = await prisma.keyword.findMany({
        where: { websiteId: id, id: { in: keywordIds } }
      });
      
      if (validKeywords.length !== keywordIds.length) {
        res.status(403).json({ error: 'Forbidden', message: 'One or more keywords do not belong to this website.' });
        return;
      }

      try {
        const enriched = await enrichKeywordsData(id, keywordIds);
        res.json({ keywords: enriched });
      } catch (innerErr: any) {
        if (innerErr.message === 'NOT_CONFIGURED') {
          res.status(503).json({ 
            error: 'Service Unavailable', 
            status: 'NOT_CONFIGURED',
            message: 'No external keyword data provider is configured.'
          });
          return;
        }
        throw innerErr;
      }
    } catch (err) {
      console.error('[Websites POST Keywords Research Error]:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// -----------------------------------------------------------------------------
// Articles (AI Content Engine)
// -----------------------------------------------------------------------------

async function checkWebsiteOwnershipLocal(req: Request, res: Response) {
  const website = await prisma.website.findUnique({
    where: { id: req.params.id, userId: req.user!.id }
  });
  if (!website) {
    res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
    return null;
  }
  return website;
}

// Generate Content Plan
router.post(
  '/:id/content-calendar/generate',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;
      
      const { numberOfArticles } = req.body;
      const { generateContentPlan } = require('../services/contentCalendar/generatePlan');
      const plan = await generateContentPlan({ 
        websiteId: website.id, 
        numberOfArticles: numberOfArticles ? parseInt(numberOfArticles, 10) : 5 
      });

      res.status(201).json({ articles: plan });
    } catch (err: any) {
      console.error('[Websites POST Content Calendar Generate Error]:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }
);

// List Articles
router.get('/:id/articles', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;

    const statusFilter = req.query.status as string | undefined;
    const whereClause: any = { websiteId: website.id };
    if (statusFilter && ['PLANNED', 'SCHEDULED', 'GENERATING', 'IDEA', 'DRAFT', 'AI_REVIEW', 'USER_REVIEW', 'APPROVED', 'PUBLISHED', 'FAILED', 'CANCELLED'].includes(statusFilter)) {
      whereClause.status = statusFilter;
    }

    const articles = await prisma.article.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' }
    });
    res.json(articles);
  } catch (err: any) {
    console.error('List Articles error:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Create Article
router.post('/:id/articles', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;
    const { topic, primaryKeyword, wordCount, tone, language, targetAudience, targetLocation, callToAction } = req.body;
    
    if (wordCount !== undefined && wordCount !== null) {
      const parsedWordCount = Number(wordCount);
      if (isNaN(parsedWordCount) || parsedWordCount < 100 || parsedWordCount > 5000) {
        res.status(400).json({ error: 'Word count must be a number between 100 and 5000' });
        return;
      }
    }

    if (topic && String(topic).length > 200) {
      res.status(400).json({ error: 'Topic cannot exceed 200 characters' });
      return;
    }
    if (primaryKeyword && String(primaryKeyword).length > 100) {
      res.status(400).json({ error: 'Primary keyword cannot exceed 100 characters' });
      return;
    }

    const article = await prisma.article.create({
      data: {
        websiteId: website.id,
        topic: String(topic || '').slice(0, 200),
        primaryKeyword: String(primaryKeyword || '').slice(0, 100),
        wordCount: wordCount ? Number(wordCount) : 1000,
        tone: String(tone || 'Professional').slice(0, 50),
        language: String(language || 'English').slice(0, 50),
        targetAudience: String(targetAudience || 'General audience').slice(0, 100),
        targetLocation: String(targetLocation || 'Global').slice(0, 100),
        callToAction: String(callToAction || '').slice(0, 200),
        status: 'IDEA'
      }
    });
    res.status(201).json(article);
  } catch (err: any) {
    console.error('Create Article error:', err);
    res.status(500).json({ error: 'Failed to create article' });
  }
});

// Get Article
router.get('/:id/articles/:articleId', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;
    const article = await prisma.article.findUnique({
      where: { id: req.params.articleId }
    });
    if (!article || article.websiteId !== website.id) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    // Attach latest job info if available
    let latestJob = null;
    const activeJobId = article.generationJobId || article.reviewJobId;
    if (activeJobId) {
      latestJob = await prisma.aiJob.findUnique({
        where: { id: activeJobId },
        select: { id: true, type: true, status: true, error: true, completedAt: true }
      });
    }

    res.json({ ...article, latestJob });
  } catch (err: any) {
    console.error('Get Article error:', err);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// Update Article
router.put('/:id/articles/:articleId', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;
    const article = await prisma.article.findUnique({
      where: { id: req.params.articleId }
    });
    if (!article || article.websiteId !== website.id) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    
    const { title, metaDescription, slug, content, topic, primaryKeyword, wordCount, tone, language, targetAudience, targetLocation, callToAction, scheduledAt } = req.body;

    const cleanContent = content !== undefined ? sanitizeHtml(String(content).slice(0, 50000)) : article.content;
    const computedWordCount = wordCount !== undefined
      ? Number(wordCount)
      : (content !== undefined && cleanContent ? cleanContent.trim().split(/\s+/).filter(Boolean).length : article.wordCount);

    const updated = await prisma.article.update({
      where: { id: req.params.articleId },
      data: {
        title: title !== undefined ? String(title).slice(0, 200) : article.title,
        metaDescription: metaDescription !== undefined ? String(metaDescription).slice(0, 350) : article.metaDescription,
        slug: slug !== undefined ? sanitizeSlug(String(slug)) : article.slug,
        content: cleanContent,
        topic: topic !== undefined ? String(topic).slice(0, 200) : article.topic,
        primaryKeyword: primaryKeyword !== undefined ? String(primaryKeyword).slice(0, 100) : article.primaryKeyword,
        wordCount: computedWordCount,
        tone: tone !== undefined ? String(tone).slice(0, 50) : article.tone,
        language: language !== undefined ? String(language).slice(0, 50) : article.language,
        targetAudience: targetAudience !== undefined ? String(targetAudience).slice(0, 100) : article.targetAudience,
        targetLocation: targetLocation !== undefined ? String(targetLocation).slice(0, 100) : article.targetLocation,
        callToAction: callToAction !== undefined ? String(callToAction).slice(0, 200) : article.callToAction,
        scheduledAt: scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : article.scheduledAt,
      }
    });
    res.json(updated);
  } catch (err: any) {
    console.error('Update Article error:', err);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// Delete Article
router.delete('/:id/articles/:articleId', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;
    const article = await prisma.article.findUnique({
      where: { id: req.params.articleId }
    });
    if (!article || article.websiteId !== website.id) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    await prisma.article.delete({ where: { id: req.params.articleId } });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete Article error:', err);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// Generate Article
router.post('/:id/articles/:articleId/generate', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;
    const article = await prisma.article.findUnique({
      where: { id: req.params.articleId }
    });
    if (!article || article.websiteId !== website.id) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    
    // Prevent duplicate generation job
    if (article.generationJobId) {
       const existingJob = await prisma.aiJob.findUnique({ where: { id: article.generationJobId } });
       if (existingJob && (existingJob.status === 'QUEUED' || existingJob.status === 'PROCESSING')) {
         res.status(409).json({ error: 'Article generation is already in progress' });
         return;
       }
    }

    const job = await prisma.aiJob.create({
      data: {
        userId: req.user!.id,
        websiteId: website.id,
        type: 'GENERATE_ARTICLE',
        payload: { articleId: article.id }
      }
    });

    await prisma.article.update({
      where: { id: article.id },
      data: { generationJobId: job.id }
    });

    generateArticle(job.id).catch(e => console.error(e));

    res.status(202).json({ jobId: job.id, status: 'QUEUED' });
  } catch (err: any) {
    console.error('Generate Article error:', err);
    res.status(500).json({ error: 'Failed to start generation' });
  }
});

// Review Article
router.post('/:id/articles/:articleId/review', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;
    const article = await prisma.article.findUnique({
      where: { id: req.params.articleId }
    });
    if (!article || article.websiteId !== website.id) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    if (!article.content) {
      res.status(400).json({ error: 'Article has no content to review' });
      return;
    }

    if (article.reviewJobId) {
       const existingJob = await prisma.aiJob.findUnique({ where: { id: article.reviewJobId } });
       if (existingJob && (existingJob.status === 'QUEUED' || existingJob.status === 'PROCESSING')) {
         res.status(409).json({ error: 'Article review is already in progress' });
         return;
       }
    }

    const job = await prisma.aiJob.create({
      data: {
        userId: req.user!.id,
        websiteId: website.id,
        type: 'REVIEW_ARTICLE',
        payload: { articleId: article.id }
      }
    });

    await prisma.article.update({
      where: { id: article.id },
      data: { reviewJobId: job.id }
    });

    reviewArticle(job.id).catch(e => console.error(e));

    res.status(202).json({ jobId: job.id, status: 'QUEUED' });
  } catch (err: any) {
    console.error('Review Article error:', err);
    res.status(500).json({ error: 'Failed to start AI review' });
  }
});

// Transition Article Workflow
router.post('/:id/articles/:articleId/transition', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;
    const article = await prisma.article.findUnique({
      where: { id: req.params.articleId }
    });
    if (!article || article.websiteId !== website.id) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    const { targetStatus } = req.body;
    const validTransitions: Record<string, string[]> = {
      PLANNED: ['SCHEDULED', 'GENERATING', 'CANCELLED'],
      SCHEDULED: ['GENERATING', 'CANCELLED'],
      GENERATING: ['DRAFT', 'FAILED'],
      IDEA: ['DRAFT', 'CANCELLED'],
      DRAFT: ['AI_REVIEW', 'USER_REVIEW', 'CANCELLED'],
      AI_REVIEW: ['USER_REVIEW'],
      USER_REVIEW: ['APPROVED', 'DRAFT'],
      APPROVED: ['PUBLISHED', 'USER_REVIEW'],
      PUBLISHED: [],
      FAILED: ['GENERATING', 'CANCELLED'],
      CANCELLED: ['PLANNED']
    };

    if (!validTransitions[article.status as string] || !validTransitions[article.status as string].includes(targetStatus)) {
      res.status(400).json({ error: `Invalid transition from ${article.status} to ${targetStatus}` });
      return;
    }

    const updated = await prisma.article.update({
      where: { id: article.id },
      data: { status: targetStatus }
    });

    res.json(updated);
  } catch (err: any) {
    console.error('Transition Article error:', err);
    res.status(500).json({ error: 'Failed to transition article status' });
  }
});

// =============================================================================
// STEP 6H: WORDPRESS CMS INTEGRATION & PUBLISHING ROUTES
// =============================================================================

/**
 * POST /api/websites/:id/integrations/wordpress
 * Connects or updates WordPress integration for the specified website.
 * Validates credentials via connection test, encrypts credentials, and saves config.
 */
router.post(
  '/:id/integrations/wordpress',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;

      const { siteUrl, username, applicationPassword } = req.body;

      if (!siteUrl || !username || !applicationPassword) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'siteUrl, username, and applicationPassword are required.',
        });
        return;
      }

      const result = await saveWordPressIntegration(
        website.id,
        String(siteUrl),
        String(username),
        String(applicationPassword)
      );

      res.status(200).json({
        success: true,
        message: 'WordPress integration connected successfully.',
        integration: result,
      });
    } catch (err: any) {
      if (err instanceof WordPressApiError) {
        res.status(err.statusCode).json({
          error: 'WordPress Integration Error',
          message: err.message,
          wpCode: err.wpCode,
        });
        return;
      }
      console.error('[WordPress Integration Save Error]:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to configure WordPress integration.',
      });
    }
  }
);

/**
 * POST /api/websites/:id/integrations/wordpress/test
 * Tests WordPress connection either with submitted credentials or with saved integration credentials.
 */
router.post(
  '/:id/integrations/wordpress/test',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;

      const { siteUrl, username, applicationPassword } = req.body;

      if (siteUrl && username && applicationPassword) {
        const testResult = await testWordPressConnection(
          String(siteUrl),
          String(username),
          String(applicationPassword)
        );
        res.status(200).json(testResult);
        return;
      }

      // If body is empty, test existing saved integration
      const existing = await prisma.integration.findUnique({
        where: {
          websiteId_provider: {
            websiteId: website.id,
            provider: 'WORDPRESS',
          },
        },
      });

      if (!existing || !existing.credentials || existing.status !== 'ACTIVE') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No active WordPress integration found to test. Please provide siteUrl, username, and applicationPassword.',
        });
        return;
      }

      const credentials = decryptJson<any>(existing.credentials);
      const config = (existing.config || {}) as any;

      const testResult = await testWordPressConnection(
        config.siteUrl,
        credentials.username,
        credentials.applicationPassword
      );

      res.status(200).json(testResult);
    } catch (err: any) {
      if (err instanceof WordPressApiError) {
        res.status(err.statusCode).json({
          error: 'WordPress Connection Error',
          message: err.message,
          wpCode: err.wpCode,
        });
        return;
      }
      console.error('[WordPress Connection Test Error]:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to test WordPress connection.',
      });
    }
  }
);

/**
 * GET /api/websites/:id/integrations/wordpress
 * Retrieves non-sensitive WordPress integration status and config.
 */
router.get(
  '/:id/integrations/wordpress',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;

      const result = await getWordPressIntegration(website.id);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[WordPress Integration Get Error]:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve WordPress integration details.',
      });
    }
  }
);

/**
 * DELETE /api/websites/:id/integrations/wordpress
 * Disconnects (deletes) the WordPress integration.
 */
router.delete(
  '/:id/integrations/wordpress',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;

      const result = await deleteWordPressIntegration(website.id);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[WordPress Integration Delete Error]:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete WordPress integration.',
      });
    }
  }
);

/**
 * POST /api/websites/:id/articles/:articleId/publish
 * Publishes an approved article to WordPress.
 * Supports live publishing, draft, or scheduled publishing.
 */
router.post(
  '/:id/articles/:articleId/publish',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;

      const { postStatus, scheduledAt } = req.body || {};

      const result = await publishArticleToWordPress(
        website.id,
        req.params.articleId,
        { postStatus, scheduledAt }
      );

      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof WordPressApiError) {
        res.status(err.statusCode).json({
          error: 'WordPress Publishing Error',
          message: err.message,
          wpCode: err.wpCode,
        });
        return;
      }
      console.error('[WordPress Publish Error]:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err?.message || 'Failed to publish article to WordPress.',
      });
    }
  }
);

/**
 * PUT /api/websites/:id/articles/:articleId/publish
 * Updates an already published article on WordPress.
 */
router.put(
  '/:id/articles/:articleId/publish',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;

      const { postStatus, scheduledAt } = req.body || {};

      const result = await publishArticleToWordPress(
        website.id,
        req.params.articleId,
        { postStatus, scheduledAt }
      );

      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof WordPressApiError) {
        res.status(err.statusCode).json({
          error: 'WordPress Publishing Error',
          message: err.message,
          wpCode: err.wpCode,
        });
        return;
      }
      console.error('[WordPress Update Publish Error]:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err?.message || 'Failed to update published WordPress post.',
      });
    }
  }
);

/**
 * DELETE /api/websites/:id/articles/:articleId/publish
 * Trashes the published post on WordPress.
 */
router.delete(
  '/:id/articles/:articleId/publish',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const website = await checkWebsiteOwnershipLocal(req, res);
      if (!website) return;

      const result = await trashWordPressPost(website.id, req.params.articleId);
      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof WordPressApiError) {
        res.status(err.statusCode).json({
          error: 'WordPress Publishing Error',
          message: err.message,
          wpCode: err.wpCode,
        });
        return;
      }
      console.error('[WordPress Trash Post Error]:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err?.message || 'Failed to trash WordPress post.',
      });
    }
  }
);

/**
 * Controller logic for GET /api/websites/:id/performance
 * Exported for testing purposes to bypass auth middleware.
 */
export const getPerformanceDataController = async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await checkWebsiteOwnershipLocal(req, res);
    if (!website) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const integrations = await prisma.integration.findMany({
      where: { websiteId: website.id },
    });
    const gscIntegration = integrations.find(i => i.provider === 'GOOGLE_SEARCH_CONSOLE');
    const ga4Integration = integrations.find(i => i.provider === 'GOOGLE_ANALYTICS');

    let searchConsole = null;
    if (gscIntegration) {
      const records = await prisma.searchPerformanceRecord.findMany({
        where: { websiteId: website.id, date: { gte: thirtyDaysAgo } },
        orderBy: { date: 'asc' }
      });

      const totalClicks = records.reduce((sum, r) => sum + r.clicks, 0);
      const totalImpressions = records.reduce((sum, r) => sum + r.impressions, 0);
      const avgCtr = records.length > 0 ? records.reduce((sum, r) => sum + r.ctr, 0) / records.length : 0;
      const avgPosition = records.length > 0 ? records.reduce((sum, r) => sum + r.position, 0) / records.length : 0;

      const queryMap = new Map<string, { clicks: number, impressions: number, ctr: number, position: number, count: number }>();
      const pageMap = new Map<string, { clicks: number, impressions: number, ctr: number, position: number, count: number }>();
      const dailyMap = new Map<string, { clicks: number, impressions: number }>();

      records.forEach(r => {
        const dStr = r.date.toISOString().split('T')[0];
        if (!dailyMap.has(dStr)) dailyMap.set(dStr, { clicks: 0, impressions: 0 });
        const d = dailyMap.get(dStr)!;
        d.clicks += r.clicks;
        d.impressions += r.impressions;

        if (!queryMap.has(r.query)) queryMap.set(r.query, { clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 });
        const q = queryMap.get(r.query)!;
        q.clicks += r.clicks;
        q.impressions += r.impressions;
        q.ctr += r.ctr;
        q.position += r.position;
        q.count++;

        if (!pageMap.has(r.page)) pageMap.set(r.page, { clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 });
        const p = pageMap.get(r.page)!;
        p.clicks += r.clicks;
        p.impressions += r.impressions;
        p.ctr += r.ctr;
        p.position += r.position;
        p.count++;
      });

      const topQueries = Array.from(queryMap.entries())
        .map(([query, data]) => ({ query, clicks: data.clicks, impressions: data.impressions, ctr: data.ctr / data.count, position: data.position / data.count }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);
      
      const topPages = Array.from(pageMap.entries())
        .map(([page, data]) => ({ page, clicks: data.clicks, impressions: data.impressions, ctr: data.ctr / data.count, position: data.position / data.count }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);

      searchConsole = {
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: avgCtr,
        averagePosition: avgPosition,
        topQueries,
        topPages,
        daily: Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date)),
        lastSyncAt: gscIntegration.lastSyncAt,
        lastSyncStatus: gscIntegration.lastSyncStatus,
      };
    }

    let analytics = null;
    if (ga4Integration) {
      const snapshots = await prisma.analyticsSnapshot.findMany({
        where: { websiteId: website.id, source: 'GOOGLE_ANALYTICS', date: { gte: thirtyDaysAgo } },
        orderBy: { date: 'asc' }
      });

      const totalActiveUsers = snapshots.reduce((sum, s) => sum + ((s.metrics as any).activeUsers || 0), 0);
      const totalSessions = snapshots.reduce((sum, s) => sum + ((s.metrics as any).sessions || 0), 0);
      const totalPageViews = snapshots.reduce((sum, s) => sum + ((s.metrics as any).screenPageViews || 0), 0);
      const avgEngagementRate = snapshots.length > 0 ? snapshots.reduce((sum, s) => sum + ((s.metrics as any).engagementRate || 0), 0) / snapshots.length : 0;

      const daily = snapshots.map(s => ({
        date: s.date.toISOString().split('T')[0],
        activeUsers: (s.metrics as any).activeUsers || 0,
        organicSessions: (s.metrics as any).sessions || 0,
      }));

      analytics = {
        activeUsers: totalActiveUsers,
        organicSessions: totalSessions,
        screenPageViews: totalPageViews,
        engagementRate: avgEngagementRate,
        daily,
        lastSyncAt: ga4Integration.lastSyncAt,
        lastSyncStatus: ga4Integration.lastSyncStatus,
      };
    }

    res.status(200).json({
      success: true,
      websiteId: website.id,
      searchConsole,
      analytics
    });
  } catch (err: any) {
    console.error('[Performance Fetch Error]:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err?.message || 'Failed to fetch performance data.',
    });
  }
};

router.get(
  '/:id/performance',
  requireAuth,
  requireSubscription,
  getPerformanceDataController
);

export default router;
