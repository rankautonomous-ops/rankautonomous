import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const DEV_FALLBACK_KEY_SEED = 'rankautonomous-cms-encryption-fallback-key-2026';

/**
 * Derives a deterministic 32-byte (256-bit) Buffer from a secret string.
 * Supports 64-character hex strings or arbitrary utf-8 passphrases hashed via SHA-256.
 */
function deriveKeyBuffer(keyString: string): Buffer {
  if (keyString.length === 64 && /^[0-9a-fA-F]+$/.test(keyString)) {
    return Buffer.from(keyString, 'hex');
  }
  return crypto.createHash('sha256').update(keyString).digest();
}

/**
 * Returns the primary key buffer to use for NEW encryptions.
 * In production, enforces that a dedicated encryption environment variable is configured.
 */
export function getPrimaryEncryptionKey(): Buffer {
  const envKey =
    process.env.CMS_ENCRYPTION_KEY ||
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY;

  if (envKey && envKey.trim().length > 0) {
    return deriveKeyBuffer(envKey.trim());
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: CMS_ENCRYPTION_KEY (or GOOGLE_TOKEN_ENCRYPTION_KEY) must be configured in production environment to encrypt credentials.'
    );
  }

  // Development/Test fallback
  return deriveKeyBuffer(DEV_FALLBACK_KEY_SEED);
}

/**
 * Returns an ordered array of candidate keys to attempt when decrypting existing data.
 * This guarantees that when keys are rotated, or if existing data was encrypted under
 * GOOGLE_TOKEN_ENCRYPTION_KEY or the dev seed, it remains readable without breaking existing credentials.
 */
export function getCandidateDecryptionKeys(): Buffer[] {
  const rawCandidateStrings = [
    process.env.CMS_ENCRYPTION_KEY,
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
    process.env.ENCRYPTION_KEY,
    DEV_FALLBACK_KEY_SEED,
  ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

  const seen = new Set<string>();
  const keys: Buffer[] = [];

  for (const s of rawCandidateStrings) {
    const keyBuf = deriveKeyBuffer(s.trim());
    const hex = keyBuf.toString('hex');
    if (!seen.has(hex)) {
      seen.add(hex);
      keys.push(keyBuf);
    }
  }

  return keys;
}

/**
 * Encrypts a plaintext string using AES-256-GCM using the active primary key.
 * Returns an envelope string: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
export function encryptCredentials(plainText: string): string {
  if (!plainText) return '';
  const key = getPrimaryEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted envelope string.
 * Gracefully iterates through candidate decryption keys (active key -> legacy env key -> dev fallback)
 * to ensure existing encrypted data is never rendered unreadable after environment or key updates.
 */
export function decryptCredentials(cipherEnvelope: string): string {
  if (!cipherEnvelope) return '';
  const parts = cipherEnvelope.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const candidateKeys = getCandidateDecryptionKeys();
  let lastError: Error | null = null;

  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });

      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw (
    lastError ||
    new Error('Failed to decrypt credentials. None of the available encryption keys matched the envelope.')
  );
}

/**
 * Helper to encrypt a JSON-serializable object.
 */
export function encryptJson(data: any): string {
  return encryptCredentials(JSON.stringify(data));
}

/**
 * Helper to decrypt an envelope into a JSON-parsed object.
 */
export function decryptJson<T = any>(cipherEnvelope: string): T {
  const jsonStr = decryptCredentials(cipherEnvelope);
  return JSON.parse(jsonStr) as T;
}

/**
 * Checks whether a string resembles a valid encrypted envelope (iv:authTag:ciphertext).
 */
export function isEncryptedEnvelope(value: string): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [ivHex, authTagHex, encryptedHex] = parts;
  return (
    ivHex.length === IV_LENGTH * 2 &&
    authTagHex.length === AUTH_TAG_LENGTH * 2 &&
    /^[0-9a-fA-F]+$/.test(ivHex) &&
    /^[0-9a-fA-F]+$/.test(authTagHex) &&
    /^[0-9a-fA-F]*$/.test(encryptedHex)
  );
}
