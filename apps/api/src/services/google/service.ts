import prisma from '../../lib/database';
import { decryptJson, encryptJson } from '../../lib/encryption';
import {
  exchangeAuthorizationCode,
  fetchGA4Properties,
  fetchSearchConsoleSites,
  refreshAccessToken,
  revokeGoogleToken,
} from './client';
import {
  getGoogleClientId,
  getGoogleOAuthCallbackUrl,
  getScopesForProvider,
  isGoogleOAuthConfigured,
} from './config';
import { createSignedOAuthState, verifyAndConsumeOAuthState } from './state';
import {
  GA4Property,
  GOOGLE_PROVIDERS,
  GoogleIntegrationConfig,
  GoogleOAuthError,
  GoogleProvider,
  SafeIntegrationResponse,
  SearchConsoleProperty,
} from './types';

export * from './types';
export * from './config';
export * from './state';
export * from './client';

/**
 * Ensures the website exists and belongs to the authenticated user.
 */
export async function verifyWebsiteOwnership(
  websiteId: string,
  userId: string
): Promise<{ id: string; userId: string; url: string; name: string }> {
  const website = await prisma.website.findFirst({
    where: {
      id: websiteId,
      userId,
    },
    select: {
      id: true,
      userId: true,
      url: true,
      name: true,
    },
  });

  if (!website) {
    throw new GoogleOAuthError(
      'Website not found or does not belong to the current user.',
      'UNAUTHORIZED',
      404
    );
  }

  return website;
}

/**
 * Generates the full Google OAuth authorization URL for a given provider and website.
 */
export async function generateGoogleAuthUrl(params: {
  userId: string;
  websiteId: string;
  provider: GoogleProvider;
}): Promise<{ authUrl: string; state: string; provider: GoogleProvider; websiteId: string }> {
  if (!isGoogleOAuthConfigured()) {
    throw new GoogleOAuthError(
      'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured on this server.',
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      503
    );
  }

  // 1. Verify website ownership
  await verifyWebsiteOwnership(params.websiteId, params.userId);

  // 2. Create signed single-use state bound to user, website, and provider
  const state = createSignedOAuthState({
    userId: params.userId,
    websiteId: params.websiteId,
    provider: params.provider,
  });

  // 3. Resolve redirect URI and scopes
  const redirectUri = getGoogleOAuthCallbackUrl(params.provider);
  const scopes = getScopesForProvider(params.provider);
  const clientId = getGoogleClientId();

  const searchParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent', // Enforce refresh token emission
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`;

  return {
    authUrl,
    state,
    provider: params.provider,
    websiteId: params.websiteId,
  };
}

/**
 * Handles the OAuth callback from Google.
 * Validates state, exchanges authorization code for tokens, encrypts credentials,
 * and persists the integration.
 */
export async function handleGoogleOAuthCallback(params: {
  code?: string;
  state?: string;
  error?: string;
  provider: GoogleProvider;
}): Promise<{ integrationId: string; websiteId: string; provider: GoogleProvider; email?: string }> {
  if (params.error) {
    throw new GoogleOAuthError(
      `Google OAuth authorization was denied or failed: ${params.error}`,
      'GOOGLE_OAUTH_ACCESS_DENIED',
      400,
      { googleError: params.error }
    );
  }

  if (!params.code) {
    throw new GoogleOAuthError('Missing authorization code from Google', 'GOOGLE_TOKEN_EXCHANGE_FAILED', 400);
  }

  if (!params.state) {
    throw new GoogleOAuthError('Missing OAuth state parameter', 'GOOGLE_OAUTH_STATE_INVALID', 400);
  }

  // 1. Validate and consume signed state
  const statePayload = verifyAndConsumeOAuthState(params.state, params.provider);

  // 2. Verify website ownership still holds
  await verifyWebsiteOwnership(statePayload.websiteId, statePayload.userId);

  // 3. Exchange code for access & refresh tokens
  const redirectUri = getGoogleOAuthCallbackUrl(params.provider);
  const tokens = await exchangeAuthorizationCode(params.code, redirectUri);

  // 4. Encrypt sensitive credentials payload at rest
  const credentialsPayload = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    tokenType: tokens.tokenType,
  };
  const encryptedCredentials = encryptJson(credentialsPayload);

  // 5. Build non-sensitive configuration
  const config: GoogleIntegrationConfig = {
    accountEmail: tokens.email,
    connectedAt: new Date().toISOString(),
    scopes: getScopesForProvider(params.provider),
    expiresAt: tokens.expiresAt,
    tokenType: tokens.tokenType,
  };

  // 6. Upsert into database
  const integration = await prisma.integration.upsert({
    where: {
      websiteId_provider: {
        websiteId: statePayload.websiteId,
        provider: params.provider,
      },
    },
    create: {
      websiteId: statePayload.websiteId,
      provider: params.provider,
      credentials: encryptedCredentials,
      config: config as any,
      status: 'ACTIVE',
      lastSyncStatus: 'IDLE',
      lastSyncError: null,
    },
    update: {
      credentials: encryptedCredentials,
      config: config as any,
      status: 'ACTIVE',
      lastSyncStatus: 'IDLE',
      lastSyncError: null,
    },
  });

  return {
    integrationId: integration.id,
    websiteId: statePayload.websiteId,
    provider: params.provider,
    email: tokens.email,
  };
}

/**
 * Retrieves a valid, unexpired access token for an integration.
 * Performs transparent token refresh with a 5-minute safety buffer if expired.
 */
export async function getValidAccessTokenForIntegration(integrationId: string): Promise<string> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration || !integration.credentials) {
    throw new GoogleOAuthError('Integration not found or missing credentials', 'GOOGLE_INTEGRATION_NOT_FOUND', 404);
  }

  let credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    tokenType?: string;
  };

  try {
    credentials = decryptJson(integration.credentials);
  } catch (err: any) {
    throw new GoogleOAuthError('Failed to decrypt integration credentials', 'GOOGLE_TOKEN_REFRESH_FAILED', 500);
  }

  const BUFFER_MS = 5 * 60 * 1000; // 5-minute safety buffer
  const isExpiringSoon = !credentials.expiresAt || Date.now() > credentials.expiresAt - BUFFER_MS;

  if (!isExpiringSoon && credentials.accessToken) {
    return credentials.accessToken;
  }

  // Token is expired or expiring soon; refresh using refreshToken
  if (!credentials.refreshToken) {
    throw new GoogleOAuthError(
      'No refresh token available to refresh expired access token. Reauthorization required.',
      'GOOGLE_TOKEN_REFRESH_FAILED',
      401
    );
  }

  try {
    const refreshed = await refreshAccessToken(credentials.refreshToken);

    // Re-encrypt with new access token and expiration
    const updatedCredentials = {
      ...credentials,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    };
    const encrypted = encryptJson(updatedCredentials);

    const updatedConfig = {
      ...((integration.config as any) || {}),
      expiresAt: refreshed.expiresAt,
    };

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        credentials: encrypted,
        config: updatedConfig,
        lastSyncStatus: 'IDLE',
      },
    });

    return refreshed.accessToken;
  } catch (err: any) {
    // Mark integration as ERROR if token refresh fails permanently
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'ERROR',
        lastSyncStatus: 'ERROR',
        lastSyncError: `Token refresh failed: ${err.message}`,
      },
    });
    throw err;
  }
}

/**
 * Lists available Search Console properties for the website's connected Google account.
 */
export async function getSearchConsoleProperties(
  websiteId: string,
  userId: string
): Promise<SearchConsoleProperty[]> {
  await verifyWebsiteOwnership(websiteId, userId);

  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      },
    },
  });

  if (!integration || integration.status !== 'ACTIVE') {
    throw new GoogleOAuthError(
      'Google Search Console is not connected for this website.',
      'GOOGLE_INTEGRATION_NOT_FOUND',
      404
    );
  }

  const token = await getValidAccessTokenForIntegration(integration.id);
  return fetchSearchConsoleSites(token);
}

/**
 * Lists available GA4 accounts and properties for the website's connected Google account.
 */
export async function getGA4Properties(websiteId: string, userId: string): Promise<GA4Property[]> {
  await verifyWebsiteOwnership(websiteId, userId);

  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
      },
    },
  });

  if (!integration || integration.status !== 'ACTIVE') {
    throw new GoogleOAuthError(
      'Google Analytics is not connected for this website.',
      'GOOGLE_INTEGRATION_NOT_FOUND',
      404
    );
  }

  const token = await getValidAccessTokenForIntegration(integration.id);
  return fetchGA4Properties(token);
}

/**
 * Explicitly binds a verified Search Console property to the website integration.
 * Rejects property IDs not returned by Google for this account.
 */
export async function selectSearchConsoleProperty(params: {
  websiteId: string;
  userId: string;
  siteUrl: string;
}): Promise<SafeIntegrationResponse> {
  const { websiteId, userId, siteUrl } = params;

  if (!siteUrl || typeof siteUrl !== 'string') {
    throw new GoogleOAuthError('siteUrl is required', 'GOOGLE_PROPERTY_ACCESS_DENIED', 400);
  }

  // 1. Fetch properties returned by Google for this account
  const availableProperties = await getSearchConsoleProperties(websiteId, userId);

  // 2. Validate user property choice against authorized properties
  const matched = availableProperties.find((p) => p.siteUrl === siteUrl.trim());
  if (!matched) {
    throw new GoogleOAuthError(
      `Property "${siteUrl}" was not found in the authorized Search Console properties for this account.`,
      'GOOGLE_PROPERTY_ACCESS_DENIED',
      403
    );
  }

  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      },
    },
  });

  if (!integration) {
    throw new GoogleOAuthError('Integration not found', 'GOOGLE_INTEGRATION_NOT_FOUND', 404);
  }

  const existingConfig = (integration.config as any) || {};
  const updatedConfig: GoogleIntegrationConfig = {
    ...existingConfig,
    selectedProperty: matched.siteUrl,
    siteUrl: matched.siteUrl,
    propertyType: matched.type,
  };

  const updated = await prisma.integration.update({
    where: { id: integration.id },
    data: {
      config: updatedConfig as any,
      status: 'ACTIVE',
    },
  });

  return sanitizeIntegration(updated);
}

/**
 * Explicitly binds a verified GA4 property to the website integration.
 * Rejects property IDs not returned by Google for this account.
 */
export async function selectGA4Property(params: {
  websiteId: string;
  userId: string;
  propertyId: string;
}): Promise<SafeIntegrationResponse> {
  const { websiteId, userId, propertyId } = params;

  if (!propertyId || typeof propertyId !== 'string') {
    throw new GoogleOAuthError('propertyId is required', 'GOOGLE_PROPERTY_ACCESS_DENIED', 400);
  }

  const normalizedPropertyId = propertyId.startsWith('properties/')
    ? propertyId
    : `properties/${propertyId}`;

  // 1. Fetch properties returned by Google for this account
  const availableProperties = await getGA4Properties(websiteId, userId);

  // 2. Validate property against authorized properties
  const matched = availableProperties.find(
    (p) => p.propertyId === normalizedPropertyId || p.numericId === propertyId
  );

  if (!matched) {
    throw new GoogleOAuthError(
      `Property "${propertyId}" was not found in the authorized GA4 properties for this account.`,
      'GOOGLE_PROPERTY_ACCESS_DENIED',
      403
    );
  }

  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
      },
    },
  });

  if (!integration) {
    throw new GoogleOAuthError('Integration not found', 'GOOGLE_INTEGRATION_NOT_FOUND', 404);
  }

  const existingConfig = (integration.config as any) || {};
  const updatedConfig: GoogleIntegrationConfig = {
    ...existingConfig,
    selectedProperty: matched.propertyId,
    propertyId: matched.propertyId,
    propertyType: 'GA4',
  };

  const updated = await prisma.integration.update({
    where: { id: integration.id },
    data: {
      config: updatedConfig as any,
      status: 'ACTIVE',
    },
  });

  return sanitizeIntegration(updated);
}

/**
 * Disconnects an integration.
 * Validates tenant ownership, attempts Google token revocation, and deletes the record.
 */
export async function disconnectIntegration(
  integrationId: string,
  userId: string
): Promise<{ success: boolean; deleted: boolean }> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      website: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!integration || integration.website.userId !== userId) {
    throw new GoogleOAuthError(
      'Integration not found or access denied.',
      'GOOGLE_INTEGRATION_NOT_FOUND',
      404
    );
  }

  // Best-effort token revocation
  if (integration.credentials) {
    try {
      const creds = decryptJson<any>(integration.credentials);
      if (creds?.refreshToken) {
        await revokeGoogleToken(creds.refreshToken);
      } else if (creds?.accessToken) {
        await revokeGoogleToken(creds.accessToken);
      }
    } catch {
      // Non-blocking
    }
  }

  await prisma.integration.delete({
    where: { id: integration.id },
  });

  return { success: true, deleted: true };
}

/**
 * Retrieves safe integration metadata for a website.
 * Omits any sensitive credentials or tokens.
 */
export async function getWebsiteIntegrations(
  websiteId: string,
  userId: string
): Promise<SafeIntegrationResponse[]> {
  await verifyWebsiteOwnership(websiteId, userId);

  const integrations = await prisma.integration.findMany({
    where: { websiteId },
    orderBy: { createdAt: 'desc' },
  });

  return integrations.map(sanitizeIntegration);
}

/**
 * Helper to strip credentials from an Integration record.
 */
export function sanitizeIntegration(integration: any): SafeIntegrationResponse {
  const config = integration.config ? { ...integration.config } : null;
  // Ensure sensitive tokens are never inadvertently passed through config
  if (config) {
    delete config.accessToken;
    delete config.refreshToken;
    delete config.credentials;
    delete config.clientSecret;
  }

  return {
    id: integration.id,
    websiteId: integration.websiteId,
    provider: integration.provider,
    status: integration.status,
    lastSyncAt: integration.lastSyncAt,
    lastSyncStatus: integration.lastSyncStatus,
    lastSyncError: integration.lastSyncError,
    config,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}
