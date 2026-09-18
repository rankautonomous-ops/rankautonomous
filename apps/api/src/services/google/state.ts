import crypto from 'crypto';
import { getGoogleOAuthStateSecret } from './config';
import { GoogleOAuthError, GoogleOAuthStatePayload, GoogleProvider } from './types';

// State expiration limit: 10 minutes (in milliseconds)
export const STATE_EXPIRATION_MS = 10 * 60 * 1000;

/**
 * In-memory single-use tracking for consumed OAuth state nonces.
 * Stores nonces with expiration timestamp so states cannot be replayed.
 */
class ConsumedStateRegistry {
  private consumed = new Map<string, number>();

  /**
   * Records a nonce as consumed.
   */
  public markConsumed(nonce: string, expiresAt: number): void {
    this.cleanup();
    this.consumed.set(nonce, expiresAt);
  }

  /**
   * Checks whether a nonce has already been consumed.
   */
  public isConsumed(nonce: string): boolean {
    this.cleanup();
    return this.consumed.has(nonce);
  }

  /**
   * Removes expired nonces from memory to prevent leaks.
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.consumed.entries()) {
      if (now > expiresAt) {
        this.consumed.delete(nonce);
      }
    }
  }

  /**
   * Resets registry (primarily for test isolation).
   */
  public clear(): void {
    this.consumed.clear();
  }
}

export const consumedStateRegistry = new ConsumedStateRegistry();

/**
 * Encodes string to URL-safe base64.
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes URL-safe base64 string.
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Computes HMAC-SHA256 signature for a state payload.
 */
function signPayload(encodedPayload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates a cryptographically signed, single-use OAuth state parameter.
 */
export function createSignedOAuthState(params: {
  userId: string;
  websiteId: string;
  provider: GoogleProvider;
}): string {
  const secret = getGoogleOAuthStateSecret();
  const payload: GoogleOAuthStatePayload = {
    userId: params.userId,
    websiteId: params.websiteId,
    provider: params.provider,
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies a signed OAuth state parameter and marks it consumed.
 * Enforces:
 * - Format integrity
 * - HMAC-SHA256 signature verification
 * - Expiration (10-minute maximum age)
 * - Single-use replay protection
 * - Provider binding
 */
export function verifyAndConsumeOAuthState(
  stateString: string,
  expectedProvider: GoogleProvider
): GoogleOAuthStatePayload {
  if (!stateString || typeof stateString !== 'string') {
    throw new GoogleOAuthError('Missing or empty OAuth state', 'GOOGLE_OAUTH_STATE_INVALID', 400);
  }

  const parts = stateString.split('.');
  if (parts.length !== 2) {
    throw new GoogleOAuthError('Malformed OAuth state envelope', 'GOOGLE_OAUTH_STATE_INVALID', 400);
  }

  const [encodedPayload, receivedSignature] = parts;
  const secret = getGoogleOAuthStateSecret();
  const expectedSignature = signPayload(encodedPayload, secret);

  // Constant-time comparison to prevent timing attacks
  const receivedBuf = Buffer.from(receivedSignature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (
    receivedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    throw new GoogleOAuthError(
      'OAuth state signature verification failed (tampered state)',
      'GOOGLE_OAUTH_STATE_INVALID',
      400
    );
  }

  let payload: GoogleOAuthStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new GoogleOAuthError(
      'Failed to parse OAuth state payload',
      'GOOGLE_OAUTH_STATE_INVALID',
      400
    );
  }

  // Validate presence of required claims
  if (!payload.userId || !payload.websiteId || !payload.provider || !payload.nonce || !payload.timestamp) {
    throw new GoogleOAuthError('OAuth state missing required fields', 'GOOGLE_OAUTH_STATE_INVALID', 400);
  }

  // Provider binding check
  if (payload.provider !== expectedProvider) {
    throw new GoogleOAuthError(
      `OAuth state provider mismatch: expected "${expectedProvider}", received "${payload.provider}"`,
      'GOOGLE_OAUTH_STATE_INVALID',
      400
    );
  }

  // Expiration check (10 minutes)
  const now = Date.now();
  if (now - payload.timestamp > STATE_EXPIRATION_MS) {
    throw new GoogleOAuthError(
      'OAuth state has expired. Please initiate connection again.',
      'GOOGLE_OAUTH_STATE_EXPIRED',
      400
    );
  }

  // Single-use check (replay protection)
  if (consumedStateRegistry.isConsumed(payload.nonce)) {
    throw new GoogleOAuthError(
      'OAuth state has already been consumed (replay attempt rejected)',
      'GOOGLE_OAUTH_STATE_REPLAYED',
      400
    );
  }

  // Mark consumed with expiration window
  consumedStateRegistry.markConsumed(payload.nonce, payload.timestamp + STATE_EXPIRATION_MS);

  return payload;
}
