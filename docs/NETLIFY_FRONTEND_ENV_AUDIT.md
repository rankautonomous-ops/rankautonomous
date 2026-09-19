# RankAutonomous: Netlify Frontend Environment Variable Audit

**AUDIT STATUS:** COMPLETE

This document details the environment variables required to deploy the Next.js frontend (`apps/web`) to Netlify. The audit analyzed all frontend code components, layouts, API fetches, authentication flows, and configuration files.

---

## 1. Frontend Environment Variables Required
The following variables were discovered in `process.env` and `NEXT_PUBLIC_*` usage across the frontend application.

| Variable Name | Required By | Build-Time / Runtime | Public vs Server-only | Source / Value Concept |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Client & Middleware | Build & Runtime | Public (Client-Safe) | Existing local Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Client & Middleware | Build & Runtime | Public (Client-Safe) | Existing local Supabase Anon Key |
| `NEXT_PUBLIC_API_URL` | Client Components (Dashboards, Billing) | Build & Runtime | Public (Client-Safe) | The URL of the production Express API |
| `NEXT_PUBLIC_APP_URL` | SEO (Sitemaps, Robots, Layouts) | Build & Runtime | Public (Client-Safe) | The URL of the deployed Netlify frontend |
| `API_URL` | Server Components (Performance Data) | Runtime | Server-Only Secret | The URL of the production Express API |

*(Note: Next.js generally bakes `NEXT_PUBLIC_` variables into static pages at build time, so they must be present during the Netlify build process.)*

---

## 2. Production API URL Requirement
The frontend makes frequent API calls to the Express backend (e.g., triggering Google synchronization, initiating Stripe checkouts, fetching performance data). 

Currently, this is configured locally as `http://localhost:4000`. 
For Netlify, `NEXT_PUBLIC_API_URL` and `API_URL` **must** be updated to point to the live Render deployment (e.g., `https://rankautonomous-api.onrender.com`). 

---

## 3. Variables NOT to Add to Netlify
The Next.js frontend relies entirely on the Express API for secure operations (OAuth, Stripe, PostgreSQL queries, AI generation). Therefore, the following backend secrets **must NEVER** be added to the Netlify environment variables:

- `DATABASE_URL`
- `DIRECT_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AI_PROVIDER_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (if applicable)

> [!CAUTION]
> Adding backend secrets to the Netlify frontend configuration (especially with a `NEXT_PUBLIC_` prefix) poses a critical security risk and will expose your database and API keys to the public browser.

---

## 4. Manual Netlify Configuration Required
To complete the frontend deployment, you must manually add the following variables in the Netlify Dashboard (under **Site Configuration > Environment Variables**):

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `NEXT_PUBLIC_API_URL`
4. `NEXT_PUBLIC_APP_URL`
5. `API_URL`

**Exact Actions:**
1. Log in to Netlify.
2. Select your deployed `rankautonomous-web` site.
3. Navigate to **Site configuration > Environment variables**.
4. Click **Add a variable**.
5. Input the 5 variables listed above. Ensure the API URLs point to your deployed Render Express server, and the App URL points to your actual Netlify domain.
6. Trigger a new deployment on Netlify to bake the variables into the build.
