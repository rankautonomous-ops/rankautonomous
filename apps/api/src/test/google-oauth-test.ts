import assert from 'assert';
import prisma from '../lib/database';
import {
  consumedStateRegistry,
  createSignedOAuthState,
  disconnectIntegration,
  generateGoogleAuthUrl,
  getFrontendIntegrationsUrl,
  getGA4Properties,
  getGoogleOAuthCallbackUrl,
  getScopesForProvider,
  getSearchConsoleProperties,
  getValidAccessTokenForIntegration,
  getWebsiteIntegrations,
  GOOGLE_PROVIDERS,
  GoogleOAuthError,
  handleGoogleOAuthCallback,
  isGoogleOAuthConfigured,
  selectGA4Property,
  selectSearchConsoleProperty,
  setGoogleHttpMock,
  verifyAndConsumeOAuthState,
} from '../services/google';
import { decryptJson, isEncryptedEnvelope } from '../lib/encryption';

export async function runGoogleOAuthTests() {
  console.log('\n==================================================');
  console.log('RUNNING STEP 6I-3 GOOGLE OAUTH BACKEND TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`PASS: ${msg}`);
      passed++;
    } else {
      console.error(`FAIL: ${msg}`);
      failed++;
    }
  }

  // Preserve original env
  const origClientId = process.env.GOOGLE_CLIENT_ID;
  const origClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const origStateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET;

  // Set test credentials
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id-123.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret-xyz';
  process.env.GOOGLE_OAUTH_STATE_SECRET = 'test-oauth-hmac-secret-key-32-bytes!';

  const testUserId1 = 'test-user-oauth-1';
  const testUserId2 = 'test-user-oauth-2';
  const testWebsiteId1 = 'test-website-oauth-1';
  const testWebsiteId2 = 'test-website-oauth-2';

  try {
    // ---------------------------------------------------------------------------
    // Setup Isolated Test Users & Websites
    // ---------------------------------------------------------------------------
    await prisma.user.upsert({
      where: { id: testUserId1 },
      update: {},
      create: {
        id: testUserId1,
        email: 'oauth-test1@test.com',
        supabaseAuthId: 'supa-oauth-1',
        role: 'CUSTOMER',
      },
    });

    await prisma.user.upsert({
      where: { id: testUserId2 },
      update: {},
      create: {
        id: testUserId2,
        email: 'oauth-test2@test.com',
        supabaseAuthId: 'supa-oauth-2',
        role: 'CUSTOMER',
      },
    });

    await prisma.website.upsert({
      where: { id: testWebsiteId1 },
      update: {},
      create: {
        id: testWebsiteId1,
        userId: testUserId1,
        url: 'https://oauth-test-domain1.com',
        name: 'OAuth Test Site 1',
      },
    });

    await prisma.website.upsert({
      where: { id: testWebsiteId2 },
      update: {},
      create: {
        id: testWebsiteId2,
        userId: testUserId2,
        url: 'https://oauth-test-domain2.com',
        name: 'OAuth Test Site 2',
      },
    });

    // ---------------------------------------------------------------------------
    // Test 1: OAuth configuration validation
    // ---------------------------------------------------------------------------
    testAssert(isGoogleOAuthConfigured() === true, 'Test 1a: isGoogleOAuthConfigured returns true when configured');

    const scCallback = getGoogleOAuthCallbackUrl(GOOGLE_PROVIDERS.SEARCH_CONSOLE);
    const gaCallback = getGoogleOAuthCallbackUrl(GOOGLE_PROVIDERS.ANALYTICS);
    testAssert(
      scCallback.includes('/api/integrations/google/search-console/callback'),
      'Test 1b: Search Console callback URL conforms to expected route'
    );
    testAssert(
      gaCallback.includes('/api/integrations/google/analytics/callback'),
      'Test 1c: Google Analytics callback URL conforms to expected route'
    );

    const scScopes = getScopesForProvider(GOOGLE_PROVIDERS.SEARCH_CONSOLE);
    testAssert(
      scScopes.includes('https://www.googleapis.com/auth/webmasters.readonly'),
      'Test 1d: Search Console scope requests readonly webmasters access'
    );
    const gaScopes = getScopesForProvider(GOOGLE_PROVIDERS.ANALYTICS);
    testAssert(
      gaScopes.includes('https://www.googleapis.com/auth/analytics.readonly'),
      'Test 1e: Google Analytics scope requests readonly analytics access'
    );

    // ---------------------------------------------------------------------------
    // Test 2: State generation & signature verification
    // ---------------------------------------------------------------------------
    const state = createSignedOAuthState({
      userId: testUserId1,
      websiteId: testWebsiteId1,
      provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
    });
    testAssert(
      typeof state === 'string' && state.includes('.'),
      'Test 2: Signed OAuth state generates valid dotted envelope'
    );

    const verified = verifyAndConsumeOAuthState(state, GOOGLE_PROVIDERS.SEARCH_CONSOLE);
    testAssert(
      verified.userId === testUserId1 &&
        verified.websiteId === testWebsiteId1 &&
        verified.provider === GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      'Test 3: Valid state verification correctly decodes payload'
    );

    // ---------------------------------------------------------------------------
    // Test 4: Replayed state rejection (single-use enforcement)
    // ---------------------------------------------------------------------------
    let replayBlocked = false;
    try {
      verifyAndConsumeOAuthState(state, GOOGLE_PROVIDERS.SEARCH_CONSOLE);
    } catch (err: any) {
      replayBlocked = err.code === 'GOOGLE_OAUTH_STATE_REPLAYED';
    }
    testAssert(replayBlocked, 'Test 4: Consumed state is rejected on second use (replay protection)');

    // ---------------------------------------------------------------------------
    // Test 5: Tampered state rejection
    // ---------------------------------------------------------------------------
    const rawState = createSignedOAuthState({
      userId: testUserId1,
      websiteId: testWebsiteId1,
      provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
    });
    const [payloadPart, sigPart] = rawState.split('.');
    const tamperedSig = sigPart.slice(0, -4) + 'abcd';
    let tamperBlocked = false;
    try {
      verifyAndConsumeOAuthState(`${payloadPart}.${tamperedSig}`, GOOGLE_PROVIDERS.SEARCH_CONSOLE);
    } catch (err: any) {
      tamperBlocked = err.code === 'GOOGLE_OAUTH_STATE_INVALID';
    }
    testAssert(tamperBlocked, 'Test 5: Tampered state signature is rejected');

    // ---------------------------------------------------------------------------
    // Test 6: Expired state rejection
    // ---------------------------------------------------------------------------
    // Forge an expired state (timestamp 15 minutes ago)
    const expiredPayload = {
      userId: testUserId1,
      websiteId: testWebsiteId1,
      provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      nonce: 'expired-nonce-test',
      timestamp: Date.now() - 15 * 60 * 1000,
    };
    const b64Payload = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const crypto = await import('crypto');
    const expSig = crypto
      .createHmac('sha256', process.env.GOOGLE_OAUTH_STATE_SECRET!)
      .update(b64Payload)
      .digest('base64url');
    const expiredState = `${b64Payload}.${expSig}`;

    let expiredBlocked = false;
    try {
      verifyAndConsumeOAuthState(expiredState, GOOGLE_PROVIDERS.SEARCH_CONSOLE);
    } catch (err: any) {
      expiredBlocked = err.code === 'GOOGLE_OAUTH_STATE_EXPIRED';
    }
    testAssert(expiredBlocked, 'Test 6: State older than 10 minutes is rejected as expired');

    // ---------------------------------------------------------------------------
    // Test 7: Wrong provider rejection
    // ---------------------------------------------------------------------------
    const gaState = createSignedOAuthState({
      userId: testUserId1,
      websiteId: testWebsiteId1,
      provider: GOOGLE_PROVIDERS.ANALYTICS,
    });
    let providerMismatchBlocked = false;
    try {
      verifyAndConsumeOAuthState(gaState, GOOGLE_PROVIDERS.SEARCH_CONSOLE);
    } catch (err: any) {
      providerMismatchBlocked = err.code === 'GOOGLE_OAUTH_STATE_INVALID';
    }
    testAssert(providerMismatchBlocked, 'Test 7: Presenting GA state to Search Console verifier is rejected');

    // ---------------------------------------------------------------------------
    // Test 8: Wrong website rejection during connect
    // ---------------------------------------------------------------------------
    let wrongWebsiteBlocked = false;
    try {
      await generateGoogleAuthUrl({
        userId: testUserId1,
        websiteId: 'non-existent-website-id',
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      });
    } catch (err: any) {
      wrongWebsiteBlocked = err.code === 'UNAUTHORIZED' && err.statusCode === 404;
    }
    testAssert(wrongWebsiteBlocked, 'Test 8: Initiating connect for non-existent website throws 404');

    // Tenant isolation on website connect
    let crossTenantConnectBlocked = false;
    try {
      // User 2 trying to connect User 1's website
      await generateGoogleAuthUrl({
        userId: testUserId2,
        websiteId: testWebsiteId1,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      });
    } catch (err: any) {
      crossTenantConnectBlocked = err.code === 'UNAUTHORIZED' && err.statusCode === 404;
    }
    testAssert(crossTenantConnectBlocked, 'Test 9: User B cannot initiate connection for User A website');

    // ---------------------------------------------------------------------------
    // Test 10: Auth URL generation structure
    // ---------------------------------------------------------------------------
    const authUrlResult = await generateGoogleAuthUrl({
      userId: testUserId1,
      websiteId: testWebsiteId1,
      provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
    });
    testAssert(
      authUrlResult.authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth') &&
        authUrlResult.authUrl.includes('client_id=' + encodeURIComponent(process.env.GOOGLE_CLIENT_ID!)) &&
        authUrlResult.authUrl.includes('access_type=offline') &&
        authUrlResult.authUrl.includes('prompt=consent'),
      'Test 10: Auth URL correctly contains OAuth parameters and offline consent'
    );

    // ---------------------------------------------------------------------------
    // Test 11: Callback handling & Token Encryption (AES-256-GCM)
    // ---------------------------------------------------------------------------
    // Setup Mock Google API responses
    setGoogleHttpMock(async (url, options) => {
      // 1. Token exchange mock
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: 'mock-access-token-initial-12345',
            refresh_token: 'mock-refresh-token-secure-67890',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'https://www.googleapis.com/auth/webmasters.readonly',
          }),
          text: async () => '',
        };
      }
      // 2. User info mock
      if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return {
          status: 200,
          ok: true,
          json: async () => ({ email: 'seo-owner@example.com' }),
          text: async () => '',
        };
      }
      // 3. Search Console sites.list mock
      if (url === 'https://www.googleapis.com/webmasters/v3/sites') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            siteEntry: [
              { siteUrl: 'sc-domain:oauth-test-domain1.com', permissionLevel: 'siteOwner' },
              { siteUrl: 'https://oauth-test-domain1.com/', permissionLevel: 'siteFullUser' },
            ],
          }),
          text: async () => '',
        };
      }
      // 4. GA4 accountSummaries mock
      if (url === 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            accountSummaries: [
              {
                account: 'accounts/112233',
                displayName: 'Main Brand Account',
                propertySummaries: [
                  {
                    property: 'properties/99887766',
                    displayName: 'OAuth Test GA4 Property',
                    propertyType: 'PROPERTY_TYPE_ORDINARY',
                  },
                ],
              },
            ],
          }),
          text: async () => '',
        };
      }
      // 5. Token revocation mock
      if (url.startsWith('https://oauth2.googleapis.com/revoke')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({}),
          text: async () => '',
        };
      }

      return {
        status: 404,
        ok: false,
        json: async () => ({ error: 'Not found' }),
        text: async () => 'Not found',
      };
    });

    const callbackState = createSignedOAuthState({
      userId: testUserId1,
      websiteId: testWebsiteId1,
      provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
    });

    const callbackRes = await handleGoogleOAuthCallback({
      code: 'mock-auth-code-valid',
      state: callbackState,
      provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
    });

    testAssert(
      Boolean(callbackRes.integrationId && callbackRes.email === 'seo-owner@example.com'),
      'Test 11a: OAuth callback successfully processes mock tokens and attaches user email'
    );

    // Verify stored Integration record
    const savedIntegration = await prisma.integration.findUnique({
      where: { id: callbackRes.integrationId },
    });

    testAssert(
      Boolean(savedIntegration && isEncryptedEnvelope(savedIntegration.credentials || '')),
      'Test 11b: Integration credentials stored at rest strictly as AES-256-GCM envelope (iv:authTag:ciphertext)'
    );

    const decryptedCreds = decryptJson<any>(savedIntegration!.credentials!);
    testAssert(
      decryptedCreds.accessToken === 'mock-access-token-initial-12345' &&
        decryptedCreds.refreshToken === 'mock-refresh-token-secure-67890',
      'Test 11c: Encrypted credentials decrypt accurately to original access and refresh tokens'
    );

    // ---------------------------------------------------------------------------
    // Test 12: Token Refresh Manager
    // ---------------------------------------------------------------------------
    // Set token expiry to 2 minutes ago to trigger automatic refresh
    const expiredCreds = {
      ...decryptedCreds,
      expiresAt: Date.now() - 2 * 60 * 1000,
    };
    const { encryptJson } = await import('../lib/encryption');
    await prisma.integration.update({
      where: { id: savedIntegration!.id },
      data: { credentials: encryptJson(expiredCreds) },
    });

    // Update mock to return refreshed token
    setGoogleHttpMock(async (url, options) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        const bodyStr = String(options.body || '');
        if (bodyStr.includes('grant_type=refresh_token')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              access_token: 'mock-access-token-REFRESHED-99999',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
            text: async () => '',
          };
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: 'mock-access-token-ga-11111',
            refresh_token: 'mock-refresh-token-ga-22222',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          text: async () => '',
        };
      }
      if (url === 'https://www.googleapis.com/webmasters/v3/sites') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            siteEntry: [
              { siteUrl: 'sc-domain:oauth-test-domain1.com', permissionLevel: 'siteOwner' },
            ],
          }),
          text: async () => '',
        };
      }
      if (url === 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries') {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            accountSummaries: [
              {
                account: 'accounts/112233',
                propertySummaries: [
                  { property: 'properties/99887766', displayName: 'OAuth Test GA4 Property' },
                ],
              },
            ],
          }),
          text: async () => '',
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({}),
        text: async () => '',
      };
    });

    const refreshedToken = await getValidAccessTokenForIntegration(savedIntegration!.id);
    testAssert(
      refreshedToken === 'mock-access-token-REFRESHED-99999',
      'Test 12: Token manager detects expired access token and refreshes transparently'
    );

    // ---------------------------------------------------------------------------
    // Test 13: Property Discovery
    // ---------------------------------------------------------------------------
    const scProps = await getSearchConsoleProperties(testWebsiteId1, testUserId1);
    testAssert(
      scProps.length === 1 && scProps[0].siteUrl === 'sc-domain:oauth-test-domain1.com' && scProps[0].type === 'DOMAIN',
      'Test 13: Search Console property discovery returns structured domain/url-prefix properties'
    );

    // ---------------------------------------------------------------------------
    // Test 14: Property Selection & Unauthorized Property Rejection
    // ---------------------------------------------------------------------------
    // Valid selection
    const selectedSc = await selectSearchConsoleProperty({
      websiteId: testWebsiteId1,
      userId: testUserId1,
      siteUrl: 'sc-domain:oauth-test-domain1.com',
    });
    testAssert(
      selectedSc.config?.selectedProperty === 'sc-domain:oauth-test-domain1.com',
      'Test 14a: Authorized Search Console property binds to integration config'
    );

    // Invalid property rejection (not in account)
    let fakePropertyBlocked = false;
    try {
      await selectSearchConsoleProperty({
        websiteId: testWebsiteId1,
        userId: testUserId1,
        siteUrl: 'sc-domain:unauthorized-domain-attacker.com',
      });
    } catch (err: any) {
      fakePropertyBlocked = err.code === 'GOOGLE_PROPERTY_ACCESS_DENIED';
    }
    testAssert(fakePropertyBlocked, 'Test 14b: Arbitrary/unverified property ID is rejected with GOOGLE_PROPERTY_ACCESS_DENIED');

    // ---------------------------------------------------------------------------
    // Test 15: Google Analytics (GA4) Flow: Callback, Discovery & Property Selection
    // ---------------------------------------------------------------------------
    const gaCallbackState = createSignedOAuthState({
      userId: testUserId1,
      websiteId: testWebsiteId1,
      provider: GOOGLE_PROVIDERS.ANALYTICS,
    });

    const gaCallbackRes = await handleGoogleOAuthCallback({
      code: 'mock-auth-code-ga-valid',
      state: gaCallbackState,
      provider: GOOGLE_PROVIDERS.ANALYTICS,
    });
    testAssert(
      Boolean(gaCallbackRes.integrationId),
      'Test 15a: Google Analytics OAuth callback persists active integration'
    );

    const gaProps = await getGA4Properties(testWebsiteId1, testUserId1);
    testAssert(
      gaProps.length === 1 && gaProps[0].propertyId === 'properties/99887766' && gaProps[0].numericId === '99887766',
      'Test 15b: GA4 property discovery parses accountSummaries into structured property records'
    );

    const selectedGa = await selectGA4Property({
      websiteId: testWebsiteId1,
      userId: testUserId1,
      propertyId: 'properties/99887766',
    });
    testAssert(
      selectedGa.config?.selectedProperty === 'properties/99887766' && selectedGa.config?.propertyId === 'properties/99887766',
      'Test 15c: Authorized GA4 property binds to integration config'
    );

    let fakeGaBlocked = false;
    try {
      await selectGA4Property({
        websiteId: testWebsiteId1,
        userId: testUserId1,
        propertyId: 'properties/00000000',
      });
    } catch (err: any) {
      fakeGaBlocked = err.code === 'GOOGLE_PROPERTY_ACCESS_DENIED';
    }
    testAssert(fakeGaBlocked, 'Test 15d: Arbitrary/unverified GA4 property ID is rejected with GOOGLE_PROPERTY_ACCESS_DENIED');

    // ---------------------------------------------------------------------------
    // Test 16: Safe Integrations API Response (Zero Token Leakage with multiple integrations)
    // ---------------------------------------------------------------------------
    const integrationsList = await getWebsiteIntegrations(testWebsiteId1, testUserId1);
    testAssert(
      integrationsList.length === 2 &&
        integrationsList.every((it) => (it as any).credentials === undefined) &&
        integrationsList.every((it) => !(it.config as any)?.accessToken) &&
        integrationsList.every((it) => !(it.config as any)?.refreshToken),
      'Test 16: Integrations status endpoint lists both integrations and strictly omits tokens and credentials'
    );

    // ---------------------------------------------------------------------------
    // Test 17: Disconnect Tenant Isolation & Revocation
    // ---------------------------------------------------------------------------
    // User 2 cannot disconnect User 1's integration
    let crossDisconnectBlocked = false;
    try {
      await disconnectIntegration(savedIntegration!.id, testUserId2);
    } catch (err: any) {
      crossDisconnectBlocked = err.code === 'GOOGLE_INTEGRATION_NOT_FOUND';
    }
    testAssert(crossDisconnectBlocked, 'Test 16a: User B cannot disconnect User A integration (tenant isolation)');

    // User 1 disconnects own integration
    const disconnectRes = await disconnectIntegration(savedIntegration!.id, testUserId1);
    testAssert(disconnectRes.deleted === true, 'Test 16b: Disconnect removes integration and triggers token revocation');

    const checkDeleted = await prisma.integration.findUnique({
      where: { id: savedIntegration!.id },
    });
    testAssert(checkDeleted === null, 'Test 16c: Integration record deleted from PostgreSQL');

    // ---------------------------------------------------------------------------
    // Test 17: Provider error handling (OAuth access denied by user)
    // ---------------------------------------------------------------------------
    let accessDeniedCaught = false;
    try {
      await handleGoogleOAuthCallback({
        error: 'access_denied',
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      });
    } catch (err: any) {
      accessDeniedCaught = err.code === 'GOOGLE_OAUTH_ACCESS_DENIED';
    }
    testAssert(accessDeniedCaught, 'Test 17: User denying consent is captured as GOOGLE_OAUTH_ACCESS_DENIED');

    console.log('\n==================================================');
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================\n');

    if (failed > 0) process.exit(1);
  } catch (error: any) {
    console.error(`FATAL ERROR IN GOOGLE OAUTH TESTS: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Reset mock handler
    setGoogleHttpMock(null);

    // Restore env vars
    if (origClientId) process.env.GOOGLE_CLIENT_ID = origClientId;
    else delete process.env.GOOGLE_CLIENT_ID;

    if (origClientSecret) process.env.GOOGLE_CLIENT_SECRET = origClientSecret;
    else delete process.env.GOOGLE_CLIENT_SECRET;

    if (origStateSecret) process.env.GOOGLE_OAUTH_STATE_SECRET = origStateSecret;
    else delete process.env.GOOGLE_OAUTH_STATE_SECRET;

    // Cleanup test data
    await prisma.integration.deleteMany({
      where: { websiteId: { in: [testWebsiteId1, testWebsiteId2] } },
    });
    await prisma.website.deleteMany({
      where: { id: { in: [testWebsiteId1, testWebsiteId2] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2] } },
    });
  }
}

if (require.main === module) {
  runGoogleOAuthTests()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
