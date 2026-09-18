import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derives or retrieves the 32-byte (256-bit) encryption key from the environment.
 * Falls back to a deterministic development key if CMS_ENCRYPTION_KEY is not set.
 */
function getEncryptionKey(): Buffer {
  const envKey =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    process.env.CMS_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      // 32-byte hex string
      return Buffer.from(envKey, 'hex');
    }
    // If arbitrary string, derive 32 bytes via SHA-256
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Deterministic local development/test fallback key
  return crypto
    .createHash('sha256')
    .update('rankautonomous-cms-encryption-fallback-key-2026')
    .digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns an envelope string: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
export function encryptCredentials(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
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
 * Throws an error if the envelope is malformed or the authentication tag does not verify.
 */
export function decryptCredentials(cipherEnvelope: string): string {
  if (!cipherEnvelope) return '';
  const parts = cipherEnvelope.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
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
