# Google Integrations & SEO Performance Database Schema (Phase 1)

This document specifies the database models, indexing strategy, data contracts, and security architecture established in **Step 6I-2** for Google Search Console (GSC), Google Analytics 4 (GA4), search performance metrics, and historical analytics rollups in RankAutonomous.

> [!NOTE]
> **Status**: Database schema foundation complete. Google OAuth, API client ingestion, cron jobs, and UI features are scheduled for subsequent phases.

---

## 1. Schema Models & Fields

### A. Model: `Integration`
Manages connections to third-party services (WordPress, Google Search Console, Google Analytics 4).

```prisma
model Integration {
  id             String    @id @default(uuid())
  websiteId      String
  website        Website   @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  provider       String    // Canonical values: "WORDPRESS", "GSC", "GOOGLE_ANALYTICS"
  config         Json?     // Non-sensitive connection metadata: { siteUrl, propertyId, email, ... }
  credentials    String?   // Encrypted reference or secure token envelope
  status         String    @default("ACTIVE") // "ACTIVE", "DISCONNECTED", "ERROR"
  lastSyncAt     DateTime?
  lastSyncStatus String?   // Allowed states: "IDLE", "SYNCING", "SUCCESS", "ERROR"
  lastSyncError  String?   @db.Text
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([websiteId])
  @@unique([websiteId, provider])
}
```

#### Field Specifications:
- **`provider`**: Canonical provider identifiers:
  - `WORDPRESS`: WordPress CMS publishing integration.
  - `GSC`: Google Search Console performance integration.
  - `GOOGLE_ANALYTICS`: Google Analytics 4 (GA4) traffic and engagement integration.
- **`config`**: Non-sensitive JSON payload storing:
  - Selected GSC property (e.g. `sc-domain:example.com` or `https://example.com/`).
  - Selected GA4 property ID (e.g. `properties/123456789`).
  - Google account email, property displayName, token expiration timestamp (`expiresAt`), granted scopes.
- **`credentials`**: Ciphertext envelope holding encrypted tokens. Never returned in public API responses.
- **`lastSyncAt`**: Timestamp of the most recent sync attempt.
- **`lastSyncStatus`**: Strict enum-like strings:
  - `IDLE`: Integration connected, waiting for scheduled or manual sync.
  - `SYNCING`: Active synchronization in progress.
  - `SUCCESS`: Last sync run completed successfully without errors.
  - `ERROR`: Last sync run failed (e.g., quota exceeded, token revoked).
- **`lastSyncError`**: Detailed error message when `lastSyncStatus === "ERROR"`.

---

### B. Model: `SearchPerformanceRecord`
Stores granular daily search performance metrics from Google Search Console normalized across queries, target landing pages, device types, and countries.

```prisma
model SearchPerformanceRecord {
  id          String   @id @default(uuid())
  websiteId   String
  website     Website  @relation(fields: [websiteId], references: [id], onDelete: Cascade)

  date        DateTime @db.Date

  query       String
  page        String

  device      String   @default("ALL") // "DESKTOP", "MOBILE", "TABLET", "ALL"
  country     String   @default("ALL") // ISO 3166-1 alpha-3 code or "ALL"

  clicks      Int
  impressions Int
  ctr         Float
  position    Float

  createdAt   DateTime @default(now())

  @@unique([websiteId, date, query, page, device, country])
  @@index([websiteId, date])
  @@index([websiteId, query])
  @@index([websiteId, page])
}
```

#### Key Architecture Principles:
- **Compound Uniqueness**: `@@unique([websiteId, date, query, page, device, country])` guarantees idempotent synchronization. Running a sync multiple times for the same date range performs deterministic upserts without creating duplicate records.
- **Date Normalization**: The `date` field uses `@db.Date` truncated to midnight UTC to ensure consistency with Google Search Console reporting buckets.
- **Efficient Indexing**:
  - `[websiteId, date]`: Fast aggregation for date-range dashboard queries.
  - `[websiteId, query]`: Fast filtering for keyword-level performance drills.
  - `[websiteId, page]`: Fast aggregation for top landing pages.

---

### C. Model: `AnalyticsSnapshot`
Stores daily summary rollups for historical trend lines, reporting, and high-level dashboard cards.

```prisma
model AnalyticsSnapshot {
  id        String   @id @default(uuid())
  websiteId String
  website   Website  @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  source    String   // "GSC", "GA4", "INTERNAL"
  date      DateTime
  metrics   Json     // Source-specific daily aggregated metrics
  createdAt DateTime @default(now())

  @@index([websiteId])
  @@index([websiteId, date])
  @@unique([websiteId, source, date])
}
```

#### Snapshot Uniqueness & Idempotency:
- `@@unique([websiteId, source, date])` enforces exactly one snapshot per source per day per website.
- **GSC Snapshot Metrics**: `{ clicks, impressions, ctr, avgPosition, queryCount, pageCount }`.
- **GA4 Snapshot Metrics**: `{ sessions, users, pageViews, bounceRate, avgSessionDuration }`.
- **Internal Snapshot Metrics**: `{ healthScore, openIssuesCount, criticalIssuesCount, publishedArticlesCount }`.

---

### D. Model: `Keyword` (GSC Enrichment Fields)
Extends the existing `Keyword` model with real GSC performance metrics without altering third-party SERP rank tracking.

```prisma
// Added fields:
gscClicks30d       Int?
gscImpressions30d  Int?
gscAvgPosition     Float?
gscLastUpdated     DateTime?
```

---

## 2. Critical Metric Distinctions

To ensure data integrity and avoid confusing users:

### A. GSC Impressions vs. Keyword Search Volume
- **Keyword Search Volume (`Keyword.searchVolume`)**: An estimated aggregate monthly search demand in a specific geographic market (typically sourced from third-party keyword databases or Google Keyword Planner). It represents total market interest.
- **GSC Impressions (`Keyword.gscImpressions30d` / `SearchPerformanceRecord.impressions`)**: The actual number of times a URL on **this specific website** appeared in Google search results for that query over the given period.
- **Rule**: Never label GSC impressions as "search volume".

### B. GSC Average Position vs. SERP Rank
- **SERP Tracked Rank (`Keyword.currentRanking`)**: An integer (1–100) representing an absolute snapshot ranking position of a page for a specific query from an unbiased, location-fixed search engine query.
- **GSC Average Position (`Keyword.gscAvgPosition` / `SearchPerformanceRecord.position`)**: A floating-point number (e.g. 6.4) representing the weighted average position of all impressions received by the site's pages for that query across varying user devices, locations, and search intents.
- **Rule**: `Keyword.currentRanking` and `Keyword.gscAvgPosition` are stored separately and displayed as distinct columns in the UI.

---

## 3. Tenant Isolation & Data Integrity

Tenant boundary hierarchy:
```text
User (Supabase Auth ID / User.id)
  └── Website (websiteId)
        ├── Integration (websiteId, provider)
        ├── SearchPerformanceRecord (websiteId, ...)
        ├── AnalyticsSnapshot (websiteId, ...)
        └── Keyword (websiteId, ...)
```

1. **Foreign Key Cascade**: All integrations, performance records, keywords, and snapshots link to `Website` with `onDelete: Cascade`. Deleting a website completely removes all its associated metrics.
2. **Access Control**: All backend API routes authenticate the user session, verify website ownership via `where: { id: websiteId, userId: req.user.id }`, and scope all database operations to that verified `websiteId`.
3. **No Cross-Pollution**: User A can never inspect, list, modify, or sync User B's properties or performance records.

---

## 4. Encrypted Credentials Concept

All sensitive OAuth credentials (refresh tokens, access tokens) are stored using **AES-256-GCM** authenticated encryption:
- Implemented in `apps/api/src/lib/encryption.ts`.
- Format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
- Derived using a 256-bit encryption key (`CMS_ENCRYPTION_KEY` or `ENCRYPTION_KEY`).
- Refresh tokens are decrypted in-memory only during background API requests and are never sent to the client browser or included in logging outputs.

---

## 5. Migration & Baselining Strategy

- **Historical State**: RankAutonomous initialized the database using `prisma db push` and did not have a legacy `prisma/migrations` folder.
- **Safe Additive Execution**:
  1. Updated `database/prisma/schema.prisma` with non-breaking, purely additive changes.
  2. Executed `prisma validate` and `prisma generate`.
  3. Applied the schema changes via `prisma db push --accept-data-loss` (after verifying 0 duplicate records existed in `AnalyticsSnapshot`).
  4. Verified that all development users, active subscriptions, and existing tables were 100% preserved.
