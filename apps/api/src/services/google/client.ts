import { getGoogleClientId, getGoogleClientSecret } from './config';
import {
  GA4Property,
  GoogleOAuthError,
  GoogleTokens,
  SearchConsoleProperty,
} from './types';

/**
 * Mock transport hook for unit and integration testing.
 * When set, requests are routed through this handler rather than global fetch.
 */
export type GoogleHttpMockHandler = (
  url: string,
  options: RequestInit
) => Promise<{ status: number; ok: boolean; json: () => Promise<any>; text: () => Promise<string> }>;

let mockHandler: GoogleHttpMockHandler | null = null;

export function setGoogleHttpMock(handler: GoogleHttpMockHandler | null): void {
  mockHandler = handler;
}

export async function performRequest(url: string, options: RequestInit): Promise<Response> {
  if (mockHandler) {
    const mockRes = await mockHandler(url, options);
    return mockRes as unknown as Response;
  }
  return fetch(url, options);
}

/**
 * Exchanges an authorization code for access and refresh tokens.
 */
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<GoogleTokens> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId || !clientSecret) {
    throw new GoogleOAuthError(
      'Google OAuth Client ID or Secret is not configured.',
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      503
    );
  }

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  try {
    const res = await performRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data?.error_description || data?.error || 'Token exchange failed';
      throw new GoogleOAuthError(
        `Failed to exchange authorization code with Google: ${errorMsg}`,
        'GOOGLE_TOKEN_EXCHANGE_FAILED',
        400,
        { googleError: data?.error }
      );
    }

    const expiresIn = Number(data.expires_in) || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    // Retrieve user email if scope allows
    let email: string | undefined;
    try {
      if (data.access_token) {
        const userInfoRes = await performRequest(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: { Authorization: `Bearer ${data.access_token}` },
          }
        );
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          email = userInfo?.email;
        }
      }
    } catch {
      // Non-fatal if email retrieval fails
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn,
      expiresAt,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
      email,
    };
  } catch (err: any) {
    if (err instanceof GoogleOAuthError) throw err;
    throw new GoogleOAuthError(
      `Network error communicating with Google OAuth service: ${err.message}`,
      'GOOGLE_TOKEN_EXCHANGE_FAILED',
      502
    );
  }
}

/**
 * Refreshes an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number; expiresAt: number; scope?: string }> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId || !clientSecret) {
    throw new GoogleOAuthError(
      'Google OAuth Client ID or Secret is not configured.',
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      503
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  try {
    const res = await performRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data?.error_description || data?.error || 'Token refresh failed';
      throw new GoogleOAuthError(
        `Failed to refresh Google access token: ${errorMsg}`,
        'GOOGLE_TOKEN_REFRESH_FAILED',
        400,
        { googleError: data?.error }
      );
    }

    const expiresIn = Number(data.expires_in) || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    return {
      accessToken: data.access_token,
      expiresIn,
      expiresAt,
      scope: data.scope,
    };
  } catch (err: any) {
    if (err instanceof GoogleOAuthError) throw err;
    throw new GoogleOAuthError(
      `Network error refreshing token: ${err.message}`,
      'GOOGLE_TOKEN_REFRESH_FAILED',
      502
    );
  }
}

/**
 * Revokes an access or refresh token with Google when disconnecting.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  if (!token) return true;

  try {
    const params = new URLSearchParams({ token });
    const res = await performRequest(
      `https://oauth2.googleapis.com/revoke?${params.toString()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    return res.ok;
  } catch {
    // Best-effort revocation
    return false;
  }
}

/**
 * Calls Search Console sites.list to retrieve verified properties for the authenticated account.
 */
export async function fetchSearchConsoleSites(
  accessToken: string
): Promise<SearchConsoleProperty[]> {
  try {
    const res = await performRequest('https://www.googleapis.com/webmasters/v3/sites', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new GoogleOAuthError(
        `Search Console API returned status ${res.status}: ${errData?.error?.message || 'Access denied'}`,
        'GOOGLE_PROPERTY_ACCESS_DENIED',
        res.status
      );
    }

    const data = await res.json();
    const siteEntries = Array.isArray(data?.siteEntry) ? data.siteEntry : [];

    return siteEntries.map((site: any) => {
      const siteUrl = String(site.siteUrl || '');
      const type = siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX';
      return {
        siteUrl,
        permissionLevel: site.permissionLevel || 'siteOwner',
        type,
      };
    });
  } catch (err: any) {
    if (err instanceof GoogleOAuthError) throw err;
    throw new GoogleOAuthError(
      `Failed to list Search Console properties: ${err.message}`,
      'GOOGLE_PROPERTY_ACCESS_DENIED',
      502
    );
  }
}

/**
 * Calls GA4 Admin API accountSummaries to list accessible GA4 accounts and properties.
 */
export async function fetchGA4Properties(accessToken: string): Promise<GA4Property[]> {
  try {
    const res = await performRequest(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new GoogleOAuthError(
        `Google Analytics Admin API returned status ${res.status}: ${errData?.error?.message || 'Access denied'}`,
        'GOOGLE_PROPERTY_ACCESS_DENIED',
        res.status
      );
    }

    const data = await res.json();
    const accountSummaries = Array.isArray(data?.accountSummaries) ? data.accountSummaries : [];

    const properties: GA4Property[] = [];

    for (const account of accountSummaries) {
      const accountId = account.account || '';
      const accountName = account.displayName || accountId;
      const propertySummaries = Array.isArray(account.propertySummaries)
        ? account.propertySummaries
        : [];

      for (const prop of propertySummaries) {
        const fullPropertyId = prop.property || ''; // e.g. "properties/123456789"
        const numericId = fullPropertyId.replace(/^properties\//, '');
        properties.push({
          accountId,
          accountName,
          propertyId: fullPropertyId,
          numericId,
          displayName: prop.displayName || numericId,
          propertyType: prop.propertyType,
        });
      }
    }

    return properties;
  } catch (err: any) {
    if (err instanceof GoogleOAuthError) throw err;
    throw new GoogleOAuthError(
      `Failed to list GA4 properties: ${err.message}`,
      'GOOGLE_PROPERTY_ACCESS_DENIED',
      502
    );
  }
}
