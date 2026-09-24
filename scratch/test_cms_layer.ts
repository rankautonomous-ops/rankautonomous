import { encryptJson, decryptJson } from '../apps/api/src/lib/encryption';
import { CmsProviderError } from '../apps/api/src/services/cms/types';
import { createCmsProvider } from '../apps/api/src/services/cms/factory';
import { isPrivateIp } from '../apps/api/src/lib/urlSafety';

async function runTests() {
  console.log('--- RUNNING CMS SECURITY & UNIT TESTS ---');

  // Test 1: Encryption/Decryption of Credentials
  try {
    const rawCredentials = { apiKey: 'secret123', shop: 'mystore.myshopify.com' };
    const encrypted = encryptJson(rawCredentials);
    
    if (encrypted === JSON.stringify(rawCredentials)) {
      throw new Error('Credentials were not encrypted!');
    }
    
    const decrypted = decryptJson(encrypted);
    if (decrypted.apiKey !== 'secret123' || decrypted.shop !== 'mystore.myshopify.com') {
      throw new Error('Decryption failed or returned incorrect data');
    }
    console.log('[PASS] Test 1: Credential Encryption & Decryption');
  } catch (err: any) {
    console.error('[FAIL] Test 1:', err.message);
  }

  // Test 2: SSRF IP Blocking Detection
  try {
    const isLocalhost = isPrivateIp('127.0.0.1');
    const isAwsMetadata = isPrivateIp('169.254.169.254');
    const isGoogleDns = isPrivateIp('8.8.8.8');
    
    if (!isLocalhost || !isAwsMetadata) {
      throw new Error('Private/metadata IPs not blocked by isPrivateIp check');
    }
    if (isGoogleDns) {
      throw new Error('Public IP incorrectly flagged as private');
    }
    console.log('[PASS] Test 2: SSRF IP Classification (isPrivateIp)');
  } catch (err: any) {
    console.error('[FAIL] Test 2:', err.message);
  }

  // Test 3: Factory Pattern
  try {
    const wpConn: any = {
      provider: 'WORDPRESS',
      baseUrl: 'https://wp.com',
      credentials: encryptJson({ username: 'u', applicationPassword: 'p' })
    };
    
    const provider = createCmsProvider(wpConn);
    if (provider.constructor.name !== 'WordPressCmsProvider') {
      throw new Error('Factory did not return WordPressCmsProvider');
    }
    console.log('[PASS] Test 3: Factory creates correct provider (WordPress)');
  } catch (err: any) {
    console.error('[FAIL] Test 3:', err.message);
  }
  
  // Test 4: Custom Webhook with Missing BaseUrl
  try {
    const customConn: any = {
      provider: 'CUSTOM',
      baseUrl: '',
      credentials: encryptJson({ token: 't' })
    };
    
    createCmsProvider(customConn);
    console.error('[FAIL] Test 4: Did not throw error for missing Base URL');
  } catch (err: any) {
    if (err instanceof CmsProviderError) {
      console.log('[PASS] Test 4: Factory validates missing Custom CMS base URL');
    } else {
      console.error('[FAIL] Test 4: Unexpected error type:', err);
    }
  }

  console.log('--- TESTS COMPLETE ---');
}

runTests();
