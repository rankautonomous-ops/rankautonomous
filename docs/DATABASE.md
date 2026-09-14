# Database Architecture

This document describes the PostgreSQL database architecture, built using Prisma ORM, for the RankAutonomous platform.

## Overview
The database is designed to securely manage a multi-tenant SaaS application where Users own multiple Websites, and Websites act as the primary domain for SEO audits, articles, keywords, and backlinks.

## Core Entities
1. **User**: Represents a customer or admin. Links directly to a third-party managed auth provider via `supabaseAuthId`.
2. **Subscription**: Manages Stripe billing state. Belongs to a User.
3. **Website**: The primary asset owned by a User. All subsequent SEO data belongs to a Website.
4. **SeoAudit**: A point-in-time analysis of a Website.
5. **SeoIssue**: A specific actionable issue discovered during an audit.
6. **Keyword**: Target or discovered keywords for a Website.
7. **Article**: AI-generated or user-created content.
8. **BacklinkOpportunity**: Potential domains for outreach.
9. **Backlink**: Acquired and tracked backlinks.
10. **Integration**: Credentials/configs for CMS or Analytics (e.g., WordPress, GSC).
11. **AnalyticsSnapshot**: Time-series metric snapshots for dashboard reporting.
12. **AiJob**: Background automation tasks (e.g., Generate Article, Crawl Website).
13. **Notification**: User-facing alerts.
14. **AuditLog**: Security and administrative action tracking.

## Multi-Tenancy Strategy
Data isolation is achieved by enforcing rigid foreign key relationships:
- Every tenant record rolls up to a `Website` or directly to a `User`.
- For example, querying SEO issues requires checking if the `websiteId` belongs to a `Website` owned by the authenticated `userId`.

## Indexing Strategy
To ensure query performance as the SaaS scales:
- **Foreign Keys**: Every foreign key (e.g., `userId`, `websiteId`) has an explicit `@@index` to speed up joins.
- **Statuses**: `@@index([status])` on `Article` and `AiJob` for fast queueing and status dashboard filtering.
- **Time-series**: `@@index([websiteId, date])` on `AnalyticsSnapshot` for rapid date-range graph generation.

## Deletion and Cascading Strategy
Cascade deletes are heavily utilized to prevent orphaned data and ease account teardown:
- `User` -> Deletes `Website`, `Subscription`, `AiJob`, `Notification`, `AuditLog`.
- `Website` -> Deletes `SeoAudit`, `SeoIssue`, `Keyword`, `Article`, `BacklinkOpportunity`, `Backlink`, `Integration`, `AnalyticsSnapshot`.
- `SeoAudit` -> Deletes associated `SeoIssue` records.

## Migration and Seeding
- **Migrations**: Always use `npx prisma migrate dev` to generate migrations locally, and `npx prisma migrate deploy` in production.
- **Seeding**: The `database/prisma/seed.ts` script populates a safe development user (`dev@rankautonomous.com`), a sample website, and sample data. Run via `npx prisma db seed`.

*Do NOT store plaintext sensitive data in integrations or audit logs.*
