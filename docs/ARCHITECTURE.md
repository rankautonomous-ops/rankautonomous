# RankAutonomous Architecture

This document outlines the architectural decisions for the RankAutonomous platform based on the Product Requirements Document (PRD).

## 1. Overall System Architecture
RankAutonomous is a B2B SaaS platform built using a modern decoupled architecture. The frontend is a Next.js application, and the backend is a Node.js REST API. They communicate securely over HTTPS. The platform relies on a PostgreSQL database for persistence, Stripe for billing, a managed auth provider (e.g. Supabase/Clerk) for identity, and background workers for long-running AI and SEO tasks.

## 2. Frontend Architecture
- **Framework**: Next.js (React)
- **Language**: TypeScript
- **Styling**: Modern CSS (Vanilla CSS modules)
- **Structure**: The frontend is divided into Public Website, Customer Application (Dashboard), and Admin Application.

## 3. Backend Architecture
- **Framework**: Node.js with Express
- **Language**: TypeScript
- **Structure**: Monolithic REST API to start, designed with modular domains (e.g., users, websites, seo-analysis, ai-jobs) to allow future microservice extraction if needed.

## 4. REST API Architecture
- **Pattern**: Resource-oriented RESTful API.
- **Data format**: JSON.
- **Endpoints**: Structured by domain (e.g., `/api/v1/websites`, `/api/v1/seo-audits`).
- **Standardization**: Consistent envelope for responses and errors.

## 5. Database Architecture
- **Engine**: PostgreSQL
- **ORM**: Prisma
- **Design**: Relational model with strong foreign key constraints.
- **Core Entities**: `User`, `Website`, `Subscription`, `SeoAudit`, `SeoIssue`, `Keyword`, `Article`, `BacklinkOpportunity`, `Backlink`, `Integration`, `AnalyticsSnapshot`, `AiJob`, `Notification`, `AuditLog`.
- **Multi-tenancy**: Enforcement through rigid foreign keys (e.g. `websiteId` and `userId`), combined with cascade deletion strategies.

## 6. Authentication Architecture
- **Provider**: Secure managed authentication solution (e.g., Supabase Auth or Auth0).
- **Flow**: JWT-based authentication. The frontend obtains a token and passes it as a Bearer token in the `Authorization` header to the backend API.

## 7. Authorization Architecture
- **Mechanism**: Middleware on the backend API checks the JWT validity and user roles.
- **Resource Ownership**: Endpoints verify that the requested resource (e.g., website) belongs to the authenticated user.

## 8. Customer/Admin Role Architecture
- **Roles**: Two primary roles defined: `Customer` and `Admin`.
- **Enforcement**: Role information is stored in the database and embedded in the JWT custom claims. Backend routes for `/api/v1/admin/*` require the `Admin` role.

## 9. AI Service Architecture
- **Integration**: Backend API communicates with external AI providers (e.g., OpenAI API) securely.
- **Safety**: API keys are never exposed to the frontend.
- **Usage Tracking**: AI requests are logged in the `ai_jobs` table to monitor usage and handle retries on failure.

## 10. Website Crawling Architecture
- **Execution**: Managed by background workers to prevent blocking the main API thread.
- **Storage**: Results are parsed and stored in the `seo_audits` and `seo_issues` tables.

## 11. SEO Analysis Architecture
- **Process**: The backend evaluates crawled data against SEO rules (Technical, On-page, etc.) and generates an SEO Health Score.
- **Output**: Generates actionable recommendations and logs them in the database.

## 12. Background Job Architecture
- **System**: A task queue (e.g., BullMQ with Redis) handles asynchronous jobs.
- **Jobs**: Daily AI article generation, crawling, backlink checks, and weekly/monthly reports.
- **Statuses**: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`.

## 13. Stripe Architecture
- **Billing**: Stripe handles subscriptions.
- **Webhooks**: Stripe webhooks sync subscription statuses (e.g., active, past_due) to the `subscriptions` table.
- **Security**: Webhook signatures are validated using `STRIPE_WEBHOOK_SECRET`.

## 14. CMS Integration Architecture
- **Mechanism**: Backend securely stores encrypted API keys/tokens for user CMS integrations (e.g., WordPress REST API).
- **Publishing**: Automated publishing is executed by background jobs via HTTP requests to the target CMS.

## 15. Analytics Integration Architecture
- **Providers**: Google Search Console, Google Analytics.
- **Data Flow**: Backend pulls data via OAuth tokens, aggregates it, and stores summaries in `analytics_snapshots` to serve dashboard graphs efficiently.

## 16. Admin Architecture
- **UI**: A dedicated section in the Next.js app, accessible only to Admins.
- **Functionality**: API endpoints for user suspension, plan management, system logs, and AI usage monitoring.

## 17. Logging
- **Application Logs**: Standard stdout/stderr logging (e.g., Pino or Winston) captured by the hosting environment.
- **Audit Logs**: Critical user actions (e.g., deleting a website, upgrading plan) are recorded in the `audit_logs` table.

## 18. Error Handling
- **API**: Global error handler middleware catches exceptions and returns standardized HTTP error responses (e.g., 400 Bad Request, 500 Internal Server Error).
- **Frontend**: Error boundaries and toast notifications display clear, user-friendly messages for failures.

## 19. Security
- **Transport**: HTTPS for all traffic.
- **Secrets**: API keys and secrets are stored in environment variables, never in source code.
- **Protection**: Input validation (e.g., Zod), rate limiting, and CORS configuration.

## 20. Environment Configuration
- **Management**: `.env` files for local development. Hostinger environment variables for production.
- **Validation**: Environment variables are validated on app startup.

## 21. Deployment Architecture
- **Platform**: Hostinger environment.
- **CI/CD**: Automated builds and deployments upon merging to the main branch.

## 22. Scalability Considerations
- **Stateless API**: The Node.js backend is stateless, allowing horizontal scaling.
- **Asynchronous Processing**: Heavy tasks (AI generation, crawling) are offloaded to background workers, preventing API bottlenecks.
- **Database Indexing**: Proper indexing on `user_id` and `website_id` ensures fast queries as data grows.
