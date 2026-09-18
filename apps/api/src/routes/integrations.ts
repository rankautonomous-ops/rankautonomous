import { Request, Response, Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSubscription } from '../middleware/subscription';
import {
  disconnectIntegration,
  GA4Property,
  generateGoogleAuthUrl,
  getFrontendIntegrationsUrl,
  getGA4Properties,
  getSearchConsoleProperties,
  getWebsiteIntegrations,
  GOOGLE_PROVIDERS,
  GoogleOAuthError,
  handleGoogleOAuthCallback,
  SearchConsoleProperty,
  selectGA4Property,
  selectSearchConsoleProperty,
  syncGoogleIntegrations,
} from '../services/google';

const router = Router();

/**
 * Helper to handle errors across integration endpoints.
 */
function handleRouteError(res: Response, err: any, fallbackMessage: string) {
  if (err instanceof GoogleOAuthError) {
    res.status(err.statusCode).json({
      error: err.name,
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  console.error(`[Integrations Route Error]: ${fallbackMessage}`, err?.message || err);
  res.status(500).json({
    error: 'Internal Server Error',
    code: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
  });
}

// ============================================================================
// Google Search Console Endpoints
// ============================================================================

/**
 * GET /api/integrations/google/search-console/connect?websiteId=<id>
 * Generates and returns Google OAuth consent URL for Search Console.
 */
router.get(
  '/google/search-console/connect',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const websiteId = String(req.query.websiteId || '').trim();
      if (!websiteId) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId query parameter is required.',
        });
        return;
      }

      const result = await generateGoogleAuthUrl({
        userId: req.user!.id,
        websiteId,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      });

      if (req.query.redirect === 'true' || req.query.format === 'redirect') {
        res.redirect(302, result.authUrl);
        return;
      }

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to initiate Search Console connection.');
    }
  }
);

/**
 * GET /api/integrations/google/search-console/callback
 * Handles Google OAuth redirect callback for Search Console.
 */
router.get(
  '/google/search-console/callback',
  async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    try {
      const result = await handleGoogleOAuthCallback({
        code,
        state,
        error,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      });

      // If client requests JSON
      if (req.headers.accept?.includes('application/json')) {
        res.status(200).json({
          success: true,
          message: 'Search Console integration connected successfully.',
          ...result,
        });
        return;
      }

      // Standard browser redirect back to frontend
      const redirectUrl = getFrontendIntegrationsUrl({
        websiteId: result.websiteId,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
        connected: true,
      });
      res.redirect(302, redirectUrl);
    } catch (err: any) {
      if (req.headers.accept?.includes('application/json')) {
        handleRouteError(res, err, 'Search Console OAuth callback failed.');
        return;
      }

      const errorCode = err instanceof GoogleOAuthError ? err.code : 'GOOGLE_OAUTH_FAILED';
      const redirectUrl = getFrontendIntegrationsUrl({
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
        error: errorCode,
      });
      res.redirect(302, redirectUrl);
    }
  }
);

/**
 * GET /api/integrations/google/search-console/properties?websiteId=<id>
 * Lists available Search Console properties from Google for the connected account.
 */
router.get(
  '/google/search-console/properties',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const websiteId = String(req.query.websiteId || '').trim();
      if (!websiteId) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId query parameter is required.',
        });
        return;
      }

      const properties: SearchConsoleProperty[] = await getSearchConsoleProperties(
        websiteId,
        req.user!.id
      );

      res.status(200).json({
        success: true,
        properties,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to fetch Search Console properties.');
    }
  }
);

/**
 * POST /api/integrations/google/search-console/select-property
 * Explicitly binds a verified Search Console property to the website.
 */
router.post(
  '/google/search-console/select-property',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { websiteId, siteUrl } = req.body || {};
      if (!websiteId || !siteUrl) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId and siteUrl are required.',
        });
        return;
      }

      const integration = await selectSearchConsoleProperty({
        websiteId: String(websiteId).trim(),
        userId: req.user!.id,
        siteUrl: String(siteUrl).trim(),
      });

      res.status(200).json({
        success: true,
        message: 'Search Console property selected successfully.',
        integration,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to select Search Console property.');
    }
  }
);

// ============================================================================
// Google Analytics (GA4) Endpoints
// ============================================================================

/**
 * GET /api/integrations/google/analytics/connect?websiteId=<id>
 * Generates and returns Google OAuth consent URL for GA4.
 */
router.get(
  '/google/analytics/connect',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const websiteId = String(req.query.websiteId || '').trim();
      if (!websiteId) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId query parameter is required.',
        });
        return;
      }

      const result = await generateGoogleAuthUrl({
        userId: req.user!.id,
        websiteId,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
      });

      if (req.query.redirect === 'true' || req.query.format === 'redirect') {
        res.redirect(302, result.authUrl);
        return;
      }

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to initiate Google Analytics connection.');
    }
  }
);

/**
 * GET /api/integrations/google/analytics/callback
 * Handles Google OAuth redirect callback for Google Analytics.
 */
router.get(
  '/google/analytics/callback',
  async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    try {
      const result = await handleGoogleOAuthCallback({
        code,
        state,
        error,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
      });

      if (req.headers.accept?.includes('application/json')) {
        res.status(200).json({
          success: true,
          message: 'Google Analytics integration connected successfully.',
          ...result,
        });
        return;
      }

      const redirectUrl = getFrontendIntegrationsUrl({
        websiteId: result.websiteId,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
        connected: true,
      });
      res.redirect(302, redirectUrl);
    } catch (err: any) {
      if (req.headers.accept?.includes('application/json')) {
        handleRouteError(res, err, 'Google Analytics OAuth callback failed.');
        return;
      }

      const errorCode = err instanceof GoogleOAuthError ? err.code : 'GOOGLE_OAUTH_FAILED';
      const redirectUrl = getFrontendIntegrationsUrl({
        provider: GOOGLE_PROVIDERS.ANALYTICS,
        error: errorCode,
      });
      res.redirect(302, redirectUrl);
    }
  }
);

/**
 * GET /api/integrations/google/analytics/properties?websiteId=<id>
 * Lists available GA4 accounts and properties from Google for the connected account.
 */
router.get(
  '/google/analytics/properties',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const websiteId = String(req.query.websiteId || '').trim();
      if (!websiteId) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId query parameter is required.',
        });
        return;
      }

      const properties: GA4Property[] = await getGA4Properties(websiteId, req.user!.id);

      res.status(200).json({
        success: true,
        properties,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to fetch GA4 properties.');
    }
  }
);

/**
 * POST /api/integrations/google/analytics/select-property
 * Explicitly binds a verified GA4 property to the website.
 */
router.post(
  '/google/analytics/select-property',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { websiteId, propertyId } = req.body || {};
      if (!websiteId || !propertyId) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId and propertyId are required.',
        });
        return;
      }

      const integration = await selectGA4Property({
        websiteId: String(websiteId).trim(),
        userId: req.user!.id,
        propertyId: String(propertyId).trim(),
      });

      res.status(200).json({
        success: true,
        message: 'Google Analytics property selected successfully.',
        integration,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to select Google Analytics property.');
    }
  }
);

// ============================================================================
// Generic Integrations Management
// ============================================================================

/**
 * GET /api/integrations?websiteId=<id>
 * Retrieves safe metadata for all integrations configured for the website.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const websiteId = String(req.query.websiteId || '').trim();
      if (!websiteId) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId query parameter is required.',
        });
        return;
      }

      const integrations = await getWebsiteIntegrations(websiteId, req.user!.id);

      res.status(200).json({
        success: true,
        integrations,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to retrieve website integrations.');
    }
  }
);

/**
 * DELETE /api/integrations/:integrationId
 * Disconnects and removes an integration. Revokes Google tokens when applicable.
 */
router.delete(
  '/:integrationId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const integrationId = req.params.integrationId;
      const result = await disconnectIntegration(integrationId, req.user!.id);

      res.status(200).json({
        message: 'Integration disconnected successfully.',
        ...result,
      });
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to disconnect integration.');
    }
  }
);

/**
 * POST /api/integrations/google/sync
 * Manually triggers synchronization for both GSC and GA4 for a specific website.
 */
router.post(
  '/google/sync',
  requireAuth,
  requireSubscription,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { websiteId } = req.body || {};
      if (!websiteId) {
        res.status(400).json({
          error: 'Bad Request',
          code: 'BAD_REQUEST',
          message: 'websiteId is required in the request body.',
        });
        return;
      }

      const result = await syncGoogleIntegrations(String(websiteId).trim(), req.user!.id);

      res.status(200).json(result);
    } catch (err: any) {
      handleRouteError(res, err, 'Failed to synchronize Google integrations.');
    }
  }
);

export default router;
