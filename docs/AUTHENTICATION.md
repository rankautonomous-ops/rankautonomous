# Authentication & Authorization Architecture - Step 3

This document details the authentication and authorization design implemented for **RankAutonomous**, strictly adhering to `RankAutonomous_PRD.pdf`.

---

## 1. High-Level Architecture Overview

RankAutonomous delegates identity management, credential hashing, session lifecycles, and password recovery to **Supabase Auth** while maintaining multi-tenant application user records in **PostgreSQL via Prisma ORM**.

```
                           ┌────────────────────────────────────────┐
                           │              Client / Web              │
                           │       Next.js App Router (SSR)         │
                           └──────────────────┬─────────────────────┘
                                              │
                     1. Sign up / Login       │ 2. Session Cookies / JWT
                                              ▼
                           ┌────────────────────────────────────────┐
                           │             Supabase Auth              │
                           │       (Managed Identity Provider)      │
                           └──────────────────┬─────────────────────┘
                                              │
                      3. API Request with     │ 4. Token Verification
                         Bearer JWT           │    supabase.auth.getUser()
                                              ▼
                           ┌────────────────────────────────────────┐
                           │            Node.js Express API         │
                           │         Auth Middleware & RBAC         │
                           └──────────────────┬─────────────────────┘
                                              │
                      5. Idempotent User Sync │ 6. Authorized Context
                         by supabaseAuthId    │    req.user
                                              ▼
                           ┌────────────────────────────────────────┐
                           │          PostgreSQL Database           │
                           │              Prisma ORM                │
                           └────────────────────────────────────────┘
```

---

## 2. Frontend Session Architecture (`apps/web`)

The Next.js App Router frontend integrates with Supabase via `@supabase/ssr`:

1. **Browser Client** (`apps/web/src/lib/supabase/client.ts`):
   - Used inside Client Components (`"use client"`).
   - Initializes with `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Used for interactive authentication operations (`signInWithPassword`, `signUp`, `resetPasswordForEmail`, `updateUser`, `signOut`).

2. **Server Client** (`apps/web/src/lib/supabase/server.ts`):
   - Used inside Server Components, Server Actions, and Route Handlers.
   - Leverages `next/headers` (`cookies()`) to read and validate session tokens on the server side before rendering pages.

3. **Session Refresh Middleware** (`apps/web/src/middleware.ts` & `src/lib/supabase/middleware.ts`):
   - Intercepts requests to refresh short-lived JWT access tokens via refresh tokens stored in secure HTTP-only cookies.
   - Enforces route protection:
     - Accessing `/app/*` without an active session automatically redirects to `/login?redirectTo=...`.
     - Accessing `/login` or `/signup` with an active session automatically redirects to `/app`.

---

## 3. Backend Token Verification (`apps/api`)

The Node.js Express API server protects internal endpoints using the `requireAuth` middleware (`apps/api/src/middleware/auth.ts`):

1. **Header Parsing**:
   - Reads the standard `Authorization: Bearer <token>` header.
   - Rejects missing or malformed headers with `401 Unauthorized`.

2. **Cryptographic & Revocation Verification**:
   - Calls Supabase Auth (`supabase.auth.getUser(token)`) to verify token validity, expiration, and user account status.
   - Rejects invalid, expired, or revoked tokens with `401 Unauthorized`.

3. **User Synchronization**:
   - Locates the existing application record in PostgreSQL:
     ```typescript
     prisma.user.findUnique({ where: { supabaseAuthId: supabaseUser.id } })
     ```
   - If not found:
     - Checks if a user with the same email exists (linking pre-seeded or pre-existing records).
     - Otherwise, creates a new `User` record with role `CUSTOMER`.
     - Handles concurrent request race conditions safely via unique constraint error handling (`P2002`).

4. **Request Context**:
   - Attaches the sanitized, typed user record to `req.user` (`AuthenticatedUser`).

---

## 4. Role Hierarchy & Authorization (RBAC)

The PRD defines two fundamental user roles:
- **`CUSTOMER`**: Default for all self-registered users. Manages customer websites, SEO audits, content, and billing.
- **`ADMIN`**: Platform administrators. Manages all users, system activity, subscriptions, and platform configuration.

### Enforcement Rules:
1. **Default Registration**: All registrations via `/signup` default strictly to `CUSTOMER`.
2. **Server-Side Authorization**:
   - `requireCustomer`: Validates that `req.user.role === 'CUSTOMER' || req.user.role === 'ADMIN'`.
   - `requireAdmin`: Validates that `req.user.role === 'ADMIN'`. Rejects customers with `403 Forbidden`.
3. **No Frontend Role Injection**: Roles stored in client metadata are ignored. The backend always loads the authoritative role from the Prisma database.

---

## 5. Available Frontend Authentication Routes

| Route | Purpose | Features |
|---|---|---|
| `/login` | Customer login | Email, password, password toggle, error banners, redirect preservation. |
| `/signup` | New account registration | Name, email, password, confirm password, 8-character validation, verification notice. |
| `/forgot-password` | Request password reset | Email input, sends recovery link to inbox. |
| `/reset-password` | Complete password reset | New password & confirmation, updates Supabase credentials. |
| `/verify-email` | Email confirmation screen | Instructions for email confirmation. |
| `/app` | Protected workspace | Displays authenticated Supabase identity and verified `/api/me` database sync. |
| `/app/profile` | Profile & Security settings | Updates display name and changes account password. |

---

## 6. Available Backend API Routes

| Method | Endpoint | Protection | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Checks API service and database connectivity (`SELECT 1`). |
| `GET` | `/api/me` | `requireAuth` | Returns authenticated user profile (`id`, `supabaseAuthId`, `email`, `name`, `role`, `createdAt`). |
| `GET` | `/api/admin/check` | `requireAuth`, `requireAdmin` | Admin-only authorization verification endpoint. |

---

## 7. Security Best Practices Implemented

- **No Passwords Stored Locally**: Zero password columns exist in PostgreSQL. Supabase Auth handles password hashing (Argon2 / bcrypt) and storage.
- **No Client Secrets**: `SUPABASE_SERVICE_ROLE_KEY` is strictly confined to backend server processes and never prefixed with `NEXT_PUBLIC_`.
- **Payload Sanitization**: `/api/me` and user responses never expose tokens, secrets, or internal database credentials.
- **CSRF & Cookie Protection**: Session tokens are managed in HTTP-only, secure, SameSite cookies via `@supabase/ssr`.
- **Safe Concurrency**: User synchronization guards against duplicate creation under concurrent requests using unique indexes.

---

## 8. Future Enhancements (Post-Step 3)

- **OAuth Providers**: When social login is enabled in future phases, Supabase OAuth handlers (Google, Microsoft) can be plugged in without changing the database schema or Express auth middleware.
- **Multi-Factor Authentication (MFA)**: Supabase TOTP can be enabled for administrator accounts.
