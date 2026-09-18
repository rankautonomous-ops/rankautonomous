# Website API Documentation

This document describes the Website Management & Onboarding REST API for RankAutonomous, following the specifications from Section 8 and Section 10 of the Product Requirements Document (PRD).

---

## 1. Authentication & Security Architecture

- **Authentication Guard**: All endpoints require a valid Supabase Bearer token via `requireAuth`.
- **Subscription Guard**: Creating (`POST /api/websites`) and updating (`PUT /api/websites/:id`) require an active or trialing Stripe subscription via `requireSubscription`.
- **Tenant Isolation**: Every database interaction is scoped to the authenticated user's ID (`where: { userId: req.user.id }`).
  - Client-supplied `userId` values in request bodies are ignored.
  - If a user requests an ID belonging to another tenant, the API returns `404 Not Found` to avoid leaking the existence of other records.
- **SSRF & URL Safety**: URLs are strictly normalized:
  - Only `https://` protocol is accepted (automatically prepended if missing).
  - Dangerous protocols (`javascript:`, `data:`, `file:`, `ftp:`) are rejected.
  - Localhost, loopback (`127.0.0.1`, `::1`), link-local, and private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are blocked.
  - IPv6 unique local (`fc00::/7`) and link-local (`fe80::/10`) are blocked.
  - Sub-paths are supported; trailing slashes on root domains are stripped.

---

## 2. Allowed Enumerations & Fields

### Allowed SEO Goals (`seoGoals`)
Only the 6 PRD-defined goals are permitted:
1. `"Increase organic traffic"`
2. `"Rank for keywords"`
3. `"Generate leads"`
4. `"Increase sales"`
5. `"Improve authority"`
6. `"Increase brand visibility"`

### Allowed Location Types (`targetLocationType`)
- `"GLOBAL"`: No region or city required.
- `"COUNTRY"`: Requires `targetCountry`.
- `"REGION"`: Requires `targetCountry` and `targetRegion`.
- `"CITY"`: Requires `targetCountry`, `targetRegion`, and `targetCity`.

### Allowed Platforms (`platform`)
1. `"WordPress"`
2. `"Shopify"`
3. `"Webflow"`
4. `"Custom"`
5. `"Other"`

### Primary Keywords (`primaryKeywords`)
- Array of strings, automatically trimmed and case-insensitively deduplicated.
- Maximum 50 keywords, maximum 100 characters per keyword.

---

## 3. Endpoints

### 1. `GET /api/websites`
Lists all websites owned by the authenticated user.

- **Auth**: `requireAuth`
- **Response `200 OK`**:
```json
{
  "websites": [
    {
      "id": "uuid",
      "url": "https://example.com",
      "name": "Example SaaS",
      "status": "CONNECTED",
      ...
    }
  ]
}
```

---

### 2. `GET /api/websites/active`
Returns the user's primary/active website.

---

### 3. `GET /api/websites/:id`
Retrieves detailed information for a specific website.

---

### 4. `POST /api/websites`
Creates a website record from onboarding wizard data.

---

### 5. `PUT /api/websites/:id`
Updates website metadata or settings.

---

### 6. `DELETE /api/websites/:id`
Soft-disconnects a website while preserving historical records.

---

### 7. `POST /api/websites/keyword-suggestions`
Generates strategic AI keyword suggestions from onboarding context.

---

### 8. `POST /api/websites/:id/keyword-suggestions`
Generates AI keyword suggestions for an existing connected website.

---

### 9. `POST /api/websites/:id/crawl`
Triggers an asynchronous crawl for the specified website.
Rejects duplicate simultaneous crawls for the same website.

- **Auth**: `requireAuth` + `requireSubscription`
- **Ownership**: Returns 404 if not owned by user.
- **Conflict**: Returns 409 if a crawl is already `PENDING` or `CRAWLING`.
- **Response `202 Accepted`**:
```json
{
  "message": "Crawl started",
  "crawlJobId": "uuid"
}
```

---

### 10. `POST /api/websites/:id/crawl/cancel`
Cancels an active or pending crawler job.

- **Auth**: `requireAuth`
- **Response `200 OK`**:
```json
{
  "message": "Crawl cancelled successfully."
}
```

---

### 11. `GET /api/websites/:id/crawl`
Retrieves the latest crawl status and progress for the website.

- **Auth**: `requireAuth`
- **Response `200 OK`**:
```json
{
  "status": "COMPLETED",
  "totalUrls": 15,
  "crawledUrls": 15,
  "failedUrls": 0,
  "progress": 1,
  "startedAt": "2026-09-15T00:00:00.000Z",
  "completedAt": "2026-09-15T00:05:00.000Z",
  "error": null
}
```

---

### 11. `GET /api/websites/:id/crawl-jobs`
Retrieves history of all crawls for the website.

- **Auth**: `requireAuth`
- **Response `200 OK`**:
```json
{
  "crawlJobs": [ ... ]
}
```

---

## 4. Crawler Architecture (Step 6E-1)

- **Execution Model**: In-process asynchronous. The `POST /crawl` endpoint creates a `CrawlJob` and returns immediately while the crawler runs in the background.
- **Constraints**: 
  - `MAX_PAGES`: 50
  - `MAX_DEPTH`: 3
  - `MAX_REDIRECTS`: 5
  - `REQUEST_TIMEOUT_MS`: 10,000
- **Domain Boundary**: The crawler normalizes URLs and strips fragments. It only queues internal links (matching origin). External links are discovered and stored in `PageResult.externalLinks` but are not queued.
- **Static Assets**: Images, CSS, JS, fonts, and video files are filtered out and not queued.
- **Robots.txt**: Parses `robots.txt` automatically. Failures to fetch `robots.txt` are safely ignored (logging a diagnostic) and the crawl continues conservatively.
- **Lifecycle transitions**:
  - Start: Website status goes `CONNECTED` → `ANALYZING`
  - Success: Website status goes `ANALYZING` → `ACTIVE`
  - Total Failure: Website status goes `ANALYZING` → `ERROR`
- **PageResult Structure**:
  Stores structured metadata, extracting `statusCode`, `title`, `description`, `h1`, `wordCount`, `htmlSize`, `internalLinks`, `externalLinks`, and `status`.

## 5. AI Provider Abstraction Architecture

- **Interface**: `IAiProvider` located in `apps/api/src/services/aiProvider.ts`.
- **Supported Providers**: `OpenAiCompatibleProvider` (works with OpenAI, OpenRouter, Azure OpenAI, Groq, or any compatible completions gateway).
