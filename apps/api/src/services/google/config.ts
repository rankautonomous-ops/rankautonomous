import { getApiBaseUrl, getAppBaseUrl, loadEnvironment } from '../../lib/env';
import { GOOGLE_PROVIDERS, GoogleProvider, GOOGLE_SCOPES } from './types';

/**
 * Server-side Google OAuth configuration module.
 * Secrets are strictly kept on the server and never returned in API payloads.
 */

export function getGoogleClientId(): string {
  loadEnvironment();
  return process.env.GOOGLE_CLIENT_ID || '';
}

export function getGoogleClientSecret(): string {
  loadEnvironment();
  return process.env.GOOGLE_CLIENT_SECRET || '';
}

export function getGoogleOAuthStateSecret(): string {
  loadEnvironment();
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.CMS_ENCRYPTION_KEY ||
    'rankautonomous-oauth-state-secret-2026'
  );
}

/**
 * Determines whether Google OAuth is configured on this environment.
 */
export function isGoogleOAuthConfigured(): boolean {
  loadEnvironment();
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  return Boolean(clientId && clientId.trim() !== '' && clientSecret && clientSecret.trim() !== '');
}

/**
 * Resolves the exact server callback URL for a specific provider.
 * Follows strict server configuration to prevent open redirects or SSRF.
 */
export function getGoogleOAuthCallbackUrl(provider: GoogleProvider): string {
  loadEnvironment();

  if (provider === GOOGLE_PROVIDERS.SEARCH_CONSOLE) {
    if (process.env.GOOGLE_OAUTH_SEARCH_CONSOLE_REDIRECT_URI) {
      return process.env.GOOGLE_OAUTH_SEARCH_CONSOLE_REDIRECT_URI;
    }
    return `${getApiBaseUrl()}/api/integrations/google/search-console/callback`;
  }

  if (provider === GOOGLE_PROVIDERS.ANALYTICS) {
    if (process.env.GOOGLE_OAUTH_ANALYTICS_REDIRECT_URI) {
      return process.env.GOOGLE_OAUTH_ANALYTICS_REDIRECT_URI;
    }
    return `${getApiBaseUrl()}/api/integrations/google/analytics/callback`;
  }

  throw new Error(`Unsupported Google provider: ${provider}`);
}

/**
 * Returns the frontend URL to redirect user after connection/property selection.
 */
export function getFrontendIntegrationsUrl(params?: {
  websiteId?: string;
  provider?: string;
  connected?: boolean;
  error?: string;
}): string {
  const baseUrl = `${getAppBaseUrl()}/app/integrations`;
  if (!params) return baseUrl;

  const searchParams = new URLSearchParams();
  if (params.websiteId) searchParams.set('websiteId', params.websiteId);
  if (params.provider) searchParams.set('provider', params.provider);
  if (params.connected) searchParams.set('connected', 'true');
  if (params.error) searchParams.set('error', params.error);

  const qs = searchParams.toString();
  return qs ? `${baseUrl}?${qs}` : baseUrl;
}

/**
 * Scopes required for a given provider.
 */
export function getScopesForProvider(provider: GoogleProvider): string[] {
  if (provider === GOOGLE_PROVIDERS.SEARCH_CONSOLE) {
    return [...GOOGLE_SCOPES.SEARCH_CONSOLE];
  }
  if (provider === GOOGLE_PROVIDERS.ANALYTICS) {
    return [...GOOGLE_SCOPES.ANALYTICS];
  }
  throw new Error(`Unsupported Google provider: ${provider}`);
}
