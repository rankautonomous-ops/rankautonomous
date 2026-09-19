# Backlink Pipeline API Documentation

This document describes the authenticated REST API for managing backlink opportunities and tracking acquired backlinks (implemented in Step 12B).

## Core Principles
1. **Authentication & Subscription**: All routes require a valid Supabase `Bearer` token and an active Stripe subscription.
2. **Strict Tenant Isolation**: Every route requires a `websiteId`. The API verifies that the authenticated user owns this website. Any attempt to access another user's `websiteId` or records returns a `404 Not Found`.
3. **No Automated Fetching (Yet)**: This API is currently for **manual CRUD and pipeline tracking**. It does not perform outbound HTTP requests to verify links or find contact info. That will be implemented in future background workers.

---

## 1. Backlink Opportunities

An opportunity represents a prospect where you want to acquire a backlink.

### `GET /api/websites/:websiteId/backlink-opportunities`
Lists all opportunities.
- **Query Parameters**:
  - `status` (OpportunityStatus): Filter by state.
  - `type` (BacklinkOpportunityType): Filter by strategy.
  - `domain` (String): Partial match search.
  - `page` (Number): Default 1.
  - `limit` (Number): Default 50 (Max 100).
- **Response**: `{ data: Opportunity[], meta: { total, page, limit } }`

### `POST /api/websites/:websiteId/backlink-opportunities`
Manually create a new prospect.
- **Body**:
  - `domain` (String, required): Target domain (e.g. `example.com`).
  - `url` (String, optional): Specific page URL (must be valid, no local IPs or malicious schemes).
  - `type` (Enum, required): Strategy type (e.g. `GUEST_POST`).
  - `relevance` (Number, optional): 0-100.
  - `domainAuthority` (Number, optional): 0-100.
- **Returns**: `201 Created` with the object. Default status is `DISCOVERED`.

### `PATCH /api/websites/:websiteId/backlink-opportunities/:id`
Updates general fields (e.g. updating `domainAuthority` or `suggestedAnchor`).
- Note: Modifying `status` is rejected here. Use the specific transition endpoint below.

### `PATCH /api/websites/:websiteId/backlink-opportunities/:id/status`
Advances the opportunity through the CRM pipeline.
- **Body**: `{ "status": "READY" }`
- **Validation**: Enforces strict state transitions. For example, you cannot jump from `DISCOVERED` to `LINK_ACQUIRED` without progressing through the pipeline.
- **LINK_ACQUIRED Shortcut**: If transitioning to `LINK_ACQUIRED`, you can optionally provide `sourceUrl` and `targetUrl` in the body. If both are valid, the API will automatically generate the active `Backlink` tracking record for you.

### `DELETE /api/websites/:websiteId/backlink-opportunities/:id`
Hard deletes the opportunity.

---

## 2. Acquired Backlinks

Represents a live backlink pointing to your website.

### `GET /api/websites/:websiteId/backlinks`
Lists acquired backlinks.
- **Query Parameters**: `status` (ACTIVE | LOST), `referringDomain`, `page`, `limit`.

### `POST /api/websites/:websiteId/backlinks`
Manually add an acquired backlink (unverified).
- **Body**:
  - `sourceUrl` (String, required): Where the link lives.
  - `targetUrl` (String, required): The page on your site being linked to.
  - `referringDomain` (String, required): Root domain of `sourceUrl`.
  - `anchorText` (String, optional).
  - `status` (String, optional): Default is `ACTIVE`.

### `PATCH /api/websites/:websiteId/backlinks/:id`
Updates `anchorText` or `status` (e.g. marking a link as `LOST`).

### `DELETE /api/websites/:websiteId/backlinks/:id`
Hard deletes the backlink.

---

## Validation & Security

- **SSRF Protection**: `sourceUrl`, `targetUrl`, and opportunity `url` are run through `validateAndNormalizeUrl()`. This rejects `javascript:`, `data:`, loopback IPs (`127.0.0.0/8`), and private network ranges. It also enforces HTTPS.
- **Ownership Integrity**: `req.body.websiteId` and `req.body.userId` are entirely ignored. Records are strictly bound to the authenticated `req.user.id` and the `req.params.websiteId` from the URL path.
- **Giant Payloads**: JSON JSONB fields like `domainInfo` and `contactInfo` are strictly limited to prevent payload abuse (max ~5KB).

## Current Limitations
- **Verification**: The system does not yet verify if a `Backlink` actually exists on the target page.
- **Data Providers**: `domainAuthority` must currently be supplied manually until Ahrefs/DataForSEO integrations are built.
