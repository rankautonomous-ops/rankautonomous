# Backlink Database Architecture

This document outlines the database foundation implemented in Phase 1 (Step 12A) for backlink opportunities and tracking.

## Overview
The schema additions provide the required infrastructure to track backlink prospects, automate outreach status pipelines, and store acquired link metrics. The design strictly preserves tenant isolation and avoids mass deletion vulnerabilities.

## Core Models

### `BacklinkOpportunity`
Represents a prospective backlink. 

**Fields Added:**
- `status` (`OpportunityStatus` Enum): Defines the exact current lifecycle state of the prospect (replaces the old loose String field). Default is `DISCOVERED`.
- `suggestedAnchor` (`String?`): Used by AI or manual users to suggest exactly what text the target site should use when linking.
- `domainAuthority` (`Int?`): A cached metric (0-100) from an external SEO provider, used to prioritize outreach.

**Indexes Added:**
- `@@index([websiteId, status])`: Optimized for the future Kanban pipeline view (e.g. "Show me all READY opportunities").
- `@@index([websiteId, type])`: Optimized for filtering by strategy type (e.g. "Guest Posts Only").

### `Backlink`
Represents a verified, acquired, and live link pointing to the customer's domain.

**Indexes Added:**
- `@@index([websiteId, status])`: Optimized for the dashboard to quickly query ACTIVE vs LOST links.

## OpportunityStatus Lifecycle
The enum `OpportunityStatus` ensures strict progression mapping:
1. `DISCOVERED`: New prospect found by API or user.
2. `QUALIFIED`: Verified as relevant and safe.
3. `READY`: Contact information (email) found and outreach prepared.
4. `CONTACTED`: Email sent.
5. `REPLIED`: Prospect responded.
6. `ACCEPTED`: Prospect agreed to place link.
7. `LINK_ACQUIRED`: The link is live and verified by RankAutonomous.
8. `REJECTED`: Prospect declined or ignored.

## Tenant Isolation & Integrity
- **Website Requirement**: Both models strictly require a `websiteId`. Global queries without a `websiteId` will fail the application-level type constraints.
- **Nullability**: `suggestedAnchor` and `domainAuthority` are strictly nullable to prevent fabricating fake data before an external provider evaluates them.
- **Constraints**: No unique constraints were added across domains/URLs. In SEO, multiple campaigns might target the same domain or URL over time for different pages. Uniqueness will be handled by application-level logic per campaign.

## Data Preservation Strategy
The schema was updated from `String` to `OpportunityStatus` only after confirming `0` rows existed in the database, meaning the migration was performed with **absolute zero data loss**.

## Future Provider Requirements
- **Metrics**: Fields like `domainAuthority` will require an abstraction over an external SEO API (Ahrefs, Moz, DataForSEO).
- **Outreach**: `contactInfo` requires an abstraction over email finder APIs (Hunter.io, Apollo).
- **Verification**: `Backlink` verification will require an internal web-crawling worker to fetch `sourceUrl` and assert `targetUrl` is present in the DOM.
