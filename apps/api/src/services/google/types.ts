/**
 * Google Integrations Canonical Types & Error Classes
 */

export const GOOGLE_PROVIDERS = {
  SEARCH_CONSOLE: 'GOOGLE_SEARCH_CONSOLE',
  ANALYTICS: 'GOOGLE_ANALYTICS',
} as const;

export type GoogleProvider = (typeof GOOGLE_PROVIDERS)[keyof typeof GOOGLE_PROVIDERS];

export const GOOGLE_SCOPES = {
  SEARCH_CONSOLE: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  ANALYTICS: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
} as const;

export interface GoogleOAuthStatePayload {
  userId: string;
  websiteId: string;
  provider: GoogleProvider;
  nonce: string;
  timestamp: number; // epoch ms
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // seconds
  expiresAt: number; // epoch ms
  tokenType: string;
  scope?: string;
  email?: string;
}

export interface GoogleIntegrationConfig {
  accountEmail?: string;
  connectedAt: string;
  scopes: string[];
  selectedProperty?: string;
  propertyId?: string; // e.g. "properties/123456789" for GA4
  siteUrl?: string; // e.g. "sc-domain:example.com" or "https://example.com/" for GSC
  propertyType?: 'DOMAIN' | 'URL_PREFIX' | 'GA4';
  expiresAt?: number;
  tokenType?: string;
}

export interface SearchConsoleProperty {
  siteUrl: string;
  permissionLevel: string;
  type: 'DOMAIN' | 'URL_PREFIX';
}

export interface GA4Property {
  accountId: string;
  accountName: string;
  propertyId: string; // e.g. "properties/123456789"
  numericId: string; // e.g. "123456789"
  displayName: string;
  propertyType?: string;
}

export interface SafeIntegrationResponse {
  id: string;
  websiteId: string;
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  config: GoogleIntegrationConfig | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GoogleOAuthErrorCode =
  | 'GOOGLE_OAUTH_NOT_CONFIGURED'
  | 'GOOGLE_OAUTH_STATE_INVALID'
  | 'GOOGLE_OAUTH_STATE_EXPIRED'
  | 'GOOGLE_OAUTH_STATE_REPLAYED'
  | 'GOOGLE_OAUTH_ACCESS_DENIED'
  | 'GOOGLE_TOKEN_EXCHANGE_FAILED'
  | 'GOOGLE_TOKEN_REFRESH_FAILED'
  | 'GOOGLE_PROPERTY_ACCESS_DENIED'
  | 'GOOGLE_INTEGRATION_NOT_FOUND'
  | 'UNAUTHORIZED';

export class GoogleOAuthError extends Error {
  public code: GoogleOAuthErrorCode;
  public statusCode: number;
  public details?: any;

  constructor(message: string, code: GoogleOAuthErrorCode, statusCode = 400, details?: any) {
    super(message);
    this.name = 'GoogleOAuthError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
