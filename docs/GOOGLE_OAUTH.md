# Google OAuth Architecture & Integration Guide

This document details the Google OAuth backend implementation for **Google Search Console (GSC)** and **Google Analytics 4 (GA4)** in RankAutonomous (Step 6I-3).

---

## 1. Environment Variables

The following environment variables configure server-side Google OAuth.

| Variable Name | Required | Default / Fallback | Description |
| :--- | :---: | :--- | :--- |
| `GOOGLE_CLIENT_ID` | Yes | *None* | OAuth 2.0 Web Client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Yes | *None* | OAuth 2.0 Client Secret from Google Cloud Console. **Never exposed to frontend.** |
| `GOOGLE_OAUTH_STATE_SECRET` | Recommended | `ENCRYPTION_KEY` | HMAC-SHA256 secret key for signing OAuth state payloads. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Recommended | `CMS_ENCRYPTION_KEY` | 32-byte (256-bit) AES key for encrypting OAuth tokens at rest. |
| `GOOGLE_OAUTH_SEARCH_CONSOLE_REDIRECT_URI` | Optional | Derived from `API_URL` | Explicit redirect URI override for Search Console callback. |
| `GOOGLE_OAUTH_ANALYTICS_REDIRECT_URI` | Optional | Derived from `API_URL` | Explicit redirect URI override for GA4 callback. |
| `API_URL` | Yes | `http://localhost:4000` | Backend API root URL. |
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` | Frontend web application root URL. |

> [!CAUTION]
> Never commit `GOOGLE_CLIENT_SECRET` or `GOOGLE_OAUTH_STATE_SECRET` to version control. They are strictly server-side environment variables.

---

## 2. OAuth Callback URLs

Google Cloud Console requires exact matching of Authorized Redirect URIs.

### Local Development Callbacks
- **Google Search Console**:
  ```text
  http://localhost:4000/api/integrations/google/search-console/callback
  ```
- **Google Analytics 4**:
  ```text
  http://localhost:4000/api/integrations/google/analytics/callback
  ```

### Production Callbacks
Derived from `API_URL` (e.g. `https://rankautonomous.com` or `https://api.rankautonomous.com`):
- **Google Search Console**:
  ```text
  ${API_URL}/api/integrations/google/search-console/callback
  ```
- **Google Analytics 4**:
  ```text
  ${API_URL}/api/integrations/google/analytics/callback
  ```

---

## 3. Scopes & Permissions

Only minimal read-only permissions are requested. Write access is never requested.

### Search Console Provider (`GOOGLE_SEARCH_CONSOLE`)
- `https://www.googleapis.com/auth/webmasters.readonly`: Read-only access to Search Console data and verified sites.
- `https://www.googleapis.com/auth/userinfo.email`: User identity email to label the connected account.

### Google Analytics Provider (`GOOGLE_ANALYTICS`)
- `https://www.googleapis.com/auth/analytics.readonly`: Read-only access to GA4 properties and reports.
- `https://www.googleapis.com/auth/userinfo.email`: User identity email to label the connected account.

---

## 4. OAuth State Security Architecture

To eliminate CSRF, state spoofing, replaying, and cross-tenant authorization attacks:

```text
User initiates connection
  ↓
Generate payload: { userId, websiteId, provider, nonce, timestamp }
  ↓
Sign using HMAC-SHA256 with GOOGLE_OAUTH_STATE_SECRET
  ↓
Output base64url state: <payload_b64>.<signature_b64>
  ↓
Transmitted to Google in authorization request
  ↓
Google redirects to callback with state
  ↓
Validation:
  1. Constant-time HMAC signature verification
  2. Max 10-minute expiration window
  3. Single-use replay check: Nonce marked consumed in memory registry
  4. Provider validation (GSC vs GA4)
  5. Website ownership check: website.userId === req.user.id
```

---

## 5. Token Encryption at Rest

Access and refresh tokens are stored in the `Integration.credentials` database column strictly as **AES-256-GCM** authenticated ciphertexts:
- Envelope structure: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
- Uses a 12-byte random IV per encryption and a 16-byte authentication tag.
- Tokens are decrypted in memory only when calling Google APIs and are never returned in REST responses or printed to logs.

---

## 6. Token Refresh Manager

1. Checks `Integration.config.expiresAt`.
2. Employs a **5-minute safety buffer**: if `Date.now() > expiresAt - 300,000`, refresh is triggered.
3. Calls `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`.
4. Re-encrypts credentials and updates `Integration` in PostgreSQL.
5. If Google returns `invalid_grant` (revoked access), the integration is marked `status: 'ERROR'` with actionable user messaging.

---

## 7. Endpoints Reference

### A. Initiation Endpoints
- `GET /api/integrations/google/search-console/connect?websiteId=<id>`
  - Requires: Authentication + Active Subscription.
  - Returns: `{ success: true, authUrl, state, provider, websiteId }` (or 302 redirect with `?redirect=true`).
- `GET /api/integrations/google/analytics/connect?websiteId=<id>`
  - Requires: Authentication + Active Subscription.
  - Returns: `{ success: true, authUrl, state, provider, websiteId }`.

### B. Callback Endpoints
- `GET /api/integrations/google/search-console/callback`
  - Validates state, exchanges code, encrypts tokens, persists `Integration`, redirects to `/app/integrations`.
- `GET /api/integrations/google/analytics/callback`
  - Validates state, exchanges code, encrypts tokens, persists `Integration`, redirects to `/app/integrations`.

### C. Property Discovery & Selection
- `GET /api/integrations/google/search-console/properties?websiteId=<id>`
  - Returns verified properties from `sites.list` (`{ siteUrl, permissionLevel, type }`).
- `POST /api/integrations/google/search-console/select-property`
  - Body: `{ websiteId, siteUrl }`.
  - Validates that `siteUrl` is in the authorized property list from Google, then binds to `Integration.config`.
- `GET /api/integrations/google/analytics/properties?websiteId=<id>`
  - Returns verified GA4 properties from `accountSummaries` (`{ accountId, propertyId, displayName }`).
- `POST /api/integrations/google/analytics/select-property`
  - Body: `{ websiteId, propertyId }`.
  - Validates that `propertyId` was returned by Google for this account, then binds to `Integration.config`.

### D. Status & Disconnect
- `GET /api/integrations?websiteId=<id>`
  - Returns safe integration metadata. **Zero token exposure.**
- `DELETE /api/integrations/:integrationId`
  - Tenant-isolated. Calls Google token revocation endpoint, then removes the integration record from PostgreSQL.

---

## 8. Google Cloud Configuration Checklist

To configure Google OAuth in Google Cloud Console:
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable APIs:
   - **Google Search Console API** (`webmasters.googleapis.com`)
   - **Google Analytics Admin API** (`analyticsadmin.googleapis.com`)
3. Configure OAuth Consent Screen:
   - User Type: External.
   - App Name: RankAutonomous.
   - Scopes:
     - `.../auth/webmasters.readonly`
     - `.../auth/analytics.readonly`
     - `.../auth/userinfo.email`
4. Create OAuth 2.0 Client ID (Web Application):
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - Production web URL (e.g. `https://rankautonomous.com`)
   - Authorized redirect URIs:
     - `http://localhost:4000/api/integrations/google/search-console/callback`
     - `http://localhost:4000/api/integrations/google/analytics/callback`
     - `${API_URL}/api/integrations/google/search-console/callback`
     - `${API_URL}/api/integrations/google/analytics/callback`
5. Copy Client ID and Client Secret into server `.env`.
