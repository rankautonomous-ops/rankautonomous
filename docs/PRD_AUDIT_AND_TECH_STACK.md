# RankAutonomous — PRD Audit & Technical Architecture Reference

**Document Version:** 1.0  
**Date:** September 2026  
**Audited Against:** `RankAutonomous_PRD.pdf` (58 Sections)

---

## 1. Executive Summary

RankAutonomous is an AI-powered SEO automation platform designed to operate continuously across four core pillars: **Analyze**, **Create**, **Build**, and **Grow**.

The application has been engineered as a production-grade, multi-tenant SaaS application featuring a **Next.js 16 frontend**, a **Node.js/Express backend**, a **Supabase PostgreSQL database with Prisma ORM**, **Stripe subscription billing**, and a hybrid background execution engine (**Render Background Worker + Render Cron + Trigger.dev v4.6.3 Cloud**).

---

## 2. PRD Gap Analysis: Completed vs. Remaining Tasks

### Phase 1: Foundation, Authentication & Billing (PRD Sections 1, 7, 31, 42, 43, 52)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **User Registration & Login** | ✅ Completed | Supabase Auth integration, JWT verification middleware, session cookies. |
| **Password Reset & Email Verification** | ✅ Completed | Managed Supabase Auth email workflows. |
| **Subscription Plans ($199/mo, $149/mo annual)** | ✅ Completed | Stripe Checkout integration with dynamic monthly and annual pricing IDs. |
| **Stripe Webhooks & Syncing** | ✅ Completed | Raw body HMAC verification for `checkout.session.completed`, `customer.subscription.updated/deleted`. |
| **Customer Billing Portal** | ✅ Completed | Stripe Customer Portal redirection for card updates, cancellations, and invoices. |
| **Subscription Access Guard** | ✅ Completed | `requireSubscription` middleware enforces active subscription on all protected endpoints. |

---

### Phase 2: Onboarding & Website Management (PRD Sections 8, 10, 34)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **7-Step Onboarding Flow** | ✅ Completed | URL, Business info, SEO goals, Target locations, Keywords, CMS choice, Initial crawl trigger. |
| **Website CRUD & Ownership** | ✅ Completed | Multi-tenant website management with strict ownership validation (`verifyWebsiteOwnership`). |
| **Multiple Website Support** | ✅ Completed | Relational schema allows multiple websites per user account. |
| **Platform Settings & Preferences** | ✅ Completed | Website profile, industry, audience, and primary keywords stored in `Website` model. |

---

### Phase 3: AI Website Analysis & SEO Health Score (PRD Sections 11, 12)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **Website Web Crawler** | ✅ Completed | Cheerio-based crawler respecting `robots.txt`, extracting titles, metas, H1/H2, canonical, and links. |
| **Technical SEO Audit** | ✅ Completed | Evaluates HTTPS, indexability, XML sitemaps, broken links, image alt texts, and URL depth. |
| **SEO Health Score (0-100)** | ✅ Completed | Weighted scoring across Technical, On-page, Content, and Internal Linking categories. |
| **SEO Issues & Prioritization** | ✅ Completed | Categorized issues with `CRITICAL`, `HIGH`, `MEDIUM`, and `LOW` severity and actionable solutions. |

---

### Phase 4: Keyword Research & AI Strategy (PRD Sections 13, 14, 15)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **Keyword Management** | ✅ Completed | Normalized keyword storage, intent classification (Informational, Commercial, etc.), difficulty, volume. |
| **AI Keyword Suggestion** | ✅ Completed | Automated keyword expansion and clustering via AI provider abstraction. |
| **AI SEO Strategy Generator** | ✅ Completed | Topic cluster generator, content outlines, and strategy roadmap based on crawl findings. |
| **Competitor Research** | ⏳ In Progress / Remaining | Competitors stored in website profile/strategy; dedicated automated competitor scraping UI is pending. |

---

### Phase 5: AI Content Creation & Publishing (PRD Sections 16, 17, 18, 19)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **AI Article Generator** | ✅ Completed | Generates 1,500+ word articles with H1/H2/H3 hierarchy, meta description, slug, and CTA. |
| **6-Stage Content Lifecycle** | ✅ Completed | State transitions: `IDEA` → `DRAFT` → `AI_REVIEW` → `USER_REVIEW` → `APPROVED` → `PUBLISHED`. |
| **Article Workspace / Editor** | ✅ Completed | Full editing, paragraph rewriting, SEO refinement, keyword insertion, and markdown/HTML export. |
| **WordPress REST API Publishing** | ✅ Completed | Direct publishing via Application Passwords (posts, featured media, categories, tags). |
| **Shopify & Webflow Publishing** | ⏳ Remaining | PRD Phase 2 extension ("where supported"). |
| **Visual Calendar View** | ⏳ Remaining | Scheduled dates (`scheduledAt`) are tracked; visual monthly calendar grid UI is pending. |

---

### Phase 6: Backlinks, Outreach & Verification (PRD Sections 20, 21, 22, 23)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **Backlink Opportunity Discovery** | ✅ Completed | Curated opportunities by type (Guest post, directory, brand mention, broken link) with domain authority. |
| **Backlink Campaign Pipeline** | ✅ Completed | Pipeline states: `DISCOVERED` → `QUALIFIED` → `READY` → `CONTACTED` → `REPLIED` → `ACCEPTED` → `LINK_ACQUIRED`. |
| **AI Outreach Assistance** | ✅ Completed | Automated personalized email outreach draft generation based on target website context. |
| **Live Backlink Verification Engine** | ✅ Completed | Real HTTP fetcher extracting links, anchor text, and `rel` attributes (`nofollow`, `sponsored`, `ugc`). |
| **Background Verification Queue** | ✅ Completed | PostgreSQL queue with `FOR UPDATE SKIP LOCKED`, claim isolation, and automatic retries. |
| **Render Daily Cron Job** | ✅ Completed | Daily cron (`enqueueStaleBacklinks.ts`) scanning active backlinks older than 7 days. |
| **Trigger.dev v4 Cloud Deployment** | ✅ Completed | `backlink-verification` task deployed to Trigger.dev Cloud with concurrency limit 5 and retry backoff. |

---

### Phase 7: Analytics, Integrations & Reports (PRD Sections 27, 28)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **Google Search Console Integration** | ✅ Completed | OAuth2 flow, token refresh, clicks, impressions, CTR, position tracking by query and page. |
| **Google Analytics 4 Integration** | ✅ Completed | OAuth2 connection storing traffic and session performance. |
| **Performance Dashboard** | ✅ Completed | Graphs for clicks, impressions, rankings, and backlink trends with date filters. |
| **Automated Monthly Emailed PDF/Digest** | ⏳ Remaining | Automated monthly PDF compilation and scheduled customer email dispatch. |

---

### Phase 8: Admin Panel & Ecosystem Oversight (PRD Section 4.2 & Section 5)
| Feature / PRD Requirement | Status | Implementation Details |
| :--- | :---: | :--- |
| **Admin Dashboard** | ⏳ Remaining | Overview of total platform users, active subscriptions, and MRR metrics. |
| **Global AI Token & Cost Monitor** | ⏳ Remaining | Aggregated tracking of OpenAI/Anthropic token consumption and costs per user. |
| **User & Tenant Management** | ⏳ Remaining | Admin UI to view all websites, inspect audit logs, and suspend delinquent or abusive accounts. |
| **System Health & Queue Logs** | ⏳ Remaining | Internal dashboard viewing dead-letter queue jobs and Trigger.dev runs. |

---

## 3. Technology Stack Reference & Project Usage

Below is a detailed inventory of every tool, library, and cloud service used in this codebase, explaining **what it is**, **why it was chosen**, and **how it is used in RankAutonomous with concrete code examples**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RankAutonomous Architecture                     │
├────────────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 16 + React 19 + Netlify)                            │
│    ├── Landing & Marketing Pages                                       │
│    ├── Supabase Client Auth & Session Management                       │
│    └── Customer Portal: Dashboard, Onboarding, Content, Backlinks      │
├────────────────────────────────────────────────────────────────────────┤
│  API Layer (Express + TypeScript + Render)                             │
│    ├── Middleware: Auth, Subscription, Website Ownership               │
│    ├── REST Endpoints: /websites, /backlinks, /billing, /integrations  │
│    └── Stripe Webhook Processor                                        │
├────────────────────────────────────────────────────────────────────────┤
│  Data Layer (PostgreSQL + Supabase + Prisma ORM)                       │
│    ├── Relational Schema (15 Models, ACID Transactions)                │
│    └── Connection Pooling via Supabase Transaction Pooler              │
├────────────────────────────────────────────────────────────────────────┤
│  Background Automation (Dual Engine Architecture)                      │
│    ├── Engine A: Render Background Worker (SQL SKIP LOCKED Queue)      │
│    ├── Engine B: Render Cron Job (Daily Stale Backlink Scanner)        │
│    └── Engine C: Trigger.dev v4.6.3 Cloud (Durable Cloud Tasks)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Next.js 16 (App Router) & React 19
- **Category:** Frontend Web Framework
- **Purpose:** Delivers high-performance server-side rendering (SSR), search-engine-friendly static pages, client interactivity, and routing.
- **Why Chosen:** Next.js App Router provides built-in SEO metadata support, optimized bundle splitting, server components, and modern CSS modules.
- **Example in Project:**
  - `apps/web/src/app/(marketing)/page.tsx`: Renders the high-converting marketing landing page, pricing tables, and FAQ with automated metadata and OpenGraph tags.
  - `apps/web/src/app/app/content/[articleId]/ArticleWorkspace.tsx`: Interactive client-side article editor allowing real-time edits, tone switching, and WordPress publishing.

---

### 2. TypeScript (v5.x)
- **Category:** Language / Type System
- **Purpose:** Guarantees strict static typing, interfaces, and compile-time contract enforcement across both frontend and backend monorepo workspaces.
- **Why Chosen:** Eliminates entire classes of runtime errors, ensures schema changes fail loudly during `tsc` builds, and improves developer velocity.
- **Example in Project:**
  - `apps/api/src/routes/backlinks.ts`: Uses TypeScript enums (`OpportunityStatus`, `BacklinkVerificationStatus`) to enforce strict state-machine transitions:
    ```typescript
    const VALID_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
      [OpportunityStatus.DISCOVERED]: [OpportunityStatus.QUALIFIED, OpportunityStatus.REJECTED],
      [OpportunityStatus.LINK_ACQUIRED]: [], // Terminal success
    };
    ```

---

### 3. Node.js (v24 LTS) & Express (v4.x)
- **Category:** Backend API Framework
- **Purpose:** Powers the core REST API server handling authentication verification, business logic, background job dispatch, and database interactions.
- **Why Chosen:** Lightweight, modular, fast request execution, and native asynchronous I/O ideal for handling webhooks, database calls, and scraping tasks.
- **Example in Project:**
  - `apps/api/src/routes/backlinks.ts`: Chained middleware verifying user identity, Stripe subscription, and multi-tenant website ownership before processing requests:
    ```typescript
    router.use(requireAuth, requireSubscription, verifyWebsiteOwnership);
    ```

---

### 4. Prisma ORM (v5.22.0)
- **Category:** Database Object-Relational Mapping (ORM)
- **Purpose:** Provides type-safe database queries, schema migrations, and relational modeling for PostgreSQL.
- **Why Chosen:** Auto-generated TypeScript types prevent column mismatches and provide autocomplete for all 15 models.
- **Example in Project:**
  - `database/prisma/schema.prisma`: Models `User`, `Website`, `Backlink`, `BackgroundJob`, and `SeoAudit`.
  - Atomically querying and updating verification results:
    ```typescript
    const backlink = await prisma.backlink.findUnique({
      where: { id: backlinkId },
      include: { website: true },
    });
    ```

---

### 5. PostgreSQL & Supabase
- **Category:** Relational Database & Managed Auth
- **Purpose:** Primary persistence engine offering ACID compliance, foreign key constraints, connection pooling, and secure JWT-based authentication.
- **Why Chosen:** Robust relational integrity for multi-tenant data; Supabase Transaction Pooler (`pgBouncer`) handles dozens of concurrent connections from Render and Trigger.dev.
- **Example in Project:**
  - `apps/api/src/middleware/auth.ts`: Validates Supabase JWT bearer tokens:
    ```typescript
    const { data: { user }, error } = await supabase.auth.getUser(token);
    ```

---

### 6. Stripe (v22.x)
- **Category:** Payment Processing & Subscription Billing
- **Purpose:** Manages subscription billing ($199/month and $149/month annual equivalent), checkout sessions, customer portal, and invoice tracking.
- **Why Chosen:** Industry standard for SaaS recurring billing with built-in SCA compliance and webhook notifications.
- **Example in Project:**
  - `apps/api/src/routes/webhook.ts`: Cryptographically validates Stripe signatures using `stripe.webhooks.constructEvent()` and keeps subscription status synced with Supabase.

---

### 7. Trigger.dev v4 (v4.6.3)
- **Category:** Durable Background Task Execution Platform
- **Purpose:** Cloud-native background worker orchestrating long-running, fault-tolerant background tasks with automatic retries, execution logs, and concurrency control.
- **Why Chosen:** Eliminates worker timeout limits, auto-scales on demand, and provides complete execution observability for background tasks.
- **Example in Project:**
  - `apps/api/src/trigger/backlinkVerification.ts`: Deployed production task:
    ```typescript
    export const backlinkVerificationTask = task({
      id: "backlink-verification",
      queue: { concurrencyLimit: 5 },
      retry: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2 },
      run: async (payload: { backlinkId: string; jobId?: string }) => {
        return executeBacklinkVerification(payload);
      },
    });
    ```

---

### 8. Cheerio (v1.2.0)
- **Category:** Server-Side HTML Parser
- **Purpose:** High-speed jQuery-like HTML parser that inspects web pages without the memory overhead of a headless browser.
- **Why Chosen:** Ingests raw HTML strings in milliseconds, making it optimal for scanning large pages for backlinks and technical SEO tags.
- **Example in Project:**
  - `apps/api/src/services/backlinks/backlinkFetcher.ts`: Scans third-party web pages to verify whether a backlink is present, captures anchor text, and checks if it includes `rel="nofollow"`:
    ```typescript
    const $ = cheerio.load(html);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (isMatch(href, targetUrl)) {
        found = true;
        anchorText = $(el).text().trim();
      }
    });
    ```

---

### 9. Robots-Parser (v3.x)
- **Category:** Compliance / Web Crawling Utility
- **Purpose:** Reads and evaluates `robots.txt` files to respect website crawling permissions.
- **Why Chosen:** Ensures RankAutonomous acts as a polite, ethical crawler adhering to webmaster rules.
- **Example in Project:**
  - `apps/api/src/services/crawler/siteCrawler.ts`: Evaluates whether a target page is crawlable before issuing an HTTP request:
    ```typescript
    const robots = robotsParser(robotsUrl, robotsTxtContent);
    if (!robots.isAllowed(targetUrl, 'RankAutonomousBot')) {
      skipUrl(targetUrl);
    }
    ```

---

### 10. Multi-Provider AI Engine (OpenAI, Anthropic Claude, Google Gemini)
- **Category:** Generative AI & Large Language Models
- **Purpose:** Generates comprehensive SEO strategies, keyword clusters, 1500+ word articles, and personalized link-building outreach emails.
- **Why Chosen:** Dynamic fallback abstraction prevents vendor lock-in and allows using the most cost-effective model per task.
- **Example in Project:**
  - `apps/api/src/services/aiProvider.ts`: Factory routing generation requests to OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), or Gemini with structured JSON outputs.

---

### 11. Google Search Console & Google Analytics APIs
- **Category:** Authoritative Search & Analytics Data
- **Purpose:** Imports real-world organic impressions, clicks, keyword rankings, and visitor metrics directly into RankAutonomous.
- **Why Chosen:** Provides ground-truth organic search performance data directly from Google.
- **Example in Project:**
  - `apps/api/src/services/google/gscService.ts`: Periodically queries the Google Search Console API for 30-day query statistics and saves them to `SearchPerformanceRecord`.

---

### 12. WordPress REST API
- **Category:** CMS Publishing Integration
- **Purpose:** Directly publishes generated and user-approved articles onto WordPress blogs.
- **Why Chosen:** WordPress powers over 40% of the web; REST API with Application Passwords enables seamless, zero-plugin publishing.
- **Example in Project:**
  - `apps/api/src/services/wordpress/index.ts`: Creates posts on remote WordPress sites via `POST /wp-json/wp/v2/posts` with featured images, HTML content, tags, and categories.

---

### 13. Render (Cloud Hosting Platform)
- **Category:** Application Hosting & Cron Orchestration
- **Purpose:** Runs the production Express REST API (`rankautonomous-api.onrender.com`), the Render Background Worker (`worker.ts`), and the Render Daily Cron (`enqueueStaleBacklinks.ts`).
- **Why Chosen:** Provides zero-downtime automatic deployments connected directly to GitHub `main` branch.
- **Example in Project:**
  - `apps/api/src/services/queue.ts`: Implements atomic database job claiming via PostgreSQL `SKIP LOCKED` so worker processes never double-claim jobs:
    ```sql
    SELECT id FROM "BackgroundJob"
    WHERE status = 'QUEUED' AND "nextRunAt" <= NOW()
    ORDER BY "createdAt" ASC LIMIT 1
    FOR UPDATE SKIP LOCKED
    ```

---

## 4. Next Recommended Steps (Roadmap to 100% PRD Completion)

1. **Production Canary for Trigger.dev**:
   - Toggle `USE_TRIGGER_BACKLINK_VERIFICATION=true` on Render to activate Trigger.dev for live backlink verifications.
2. **Automated Monthly SEO Reports (PRD Section 27)**:
   - Build a monthly summary generator that aggregates organic traffic changes, published articles, and acquired links into a downloadable PDF/email digest.
3. **Dedicated Competitor Analysis UI (PRD Section 15)**:
   - Introduce a competitor comparison dashboard comparing user domain authority and keyword gaps against competitors.
4. **Admin Dashboard (PRD Section 4.2 & Section 5)**:
   - Create an admin portal (`/admin`) for platform-level oversight: total user counts, active MRR, AI token spend, and job queue inspection.
5. **Shopify / Webflow CMS Connectors (PRD Section 18)**:
   - Add OAuth connectors for Shopify blogs and Webflow CMS collections.
