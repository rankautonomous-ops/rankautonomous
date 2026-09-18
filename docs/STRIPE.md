# Stripe Billing & Subscriptions Integration

This document outlines the Stripe subscription and billing architecture for **RankAutonomous**, adhering to `RankAutonomous_PRD.pdf`.

---

## 1. Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Next.js Web (Client)   │
                          └─────────────┬────────────┘
                                        │  Bearer JWT (Supabase)
                                        ▼
                          ┌──────────────────────────┐
                          │  Express API (Backend)   │
                          └──────┬────────────┬──────┘
                                 │            │
                 Stripe Node SDK │            │ Prisma ORM
                                 ▼            ▼
                     ┌────────────────┐  ┌────────────────┐
                     │     Stripe     │  │   PostgreSQL   │
                     │  (Test Mode)   │  │   (Database)   │
                     └───────┬────────┘  └────────────────┘
                             │
                             │ Webhooks (Raw Signature Checked)
                             ▼
                     POST /api/stripe/webhook
```

### Key Principles:
1. **Zero Secret Key Exposure**: `STRIPE_SECRET_KEY` is strictly confined to `apps/api`. No secret keys or webhook secrets are ever transmitted or bundled into client code.
2. **Server-Side Plan Mapping**: Clients can only request a safe plan identifier (`"monthly"` or `"annual"`). The server resolves this identifier to the configured environment variable price IDs (`STRIPE_MONTHLY_PRICE_ID` or `STRIPE_ANNUAL_PRICE_ID`). Arbitrary price IDs from clients are rejected with `400 Bad Request`.
3. **Raw Body Webhook Parsing**: Cryptographic verification via `stripe.webhooks.constructEvent` requires the unparsed Buffer payload. In `apps/api/src/index.ts`, `express.raw({ type: 'application/json' })` is mounted specifically on `/api/stripe/webhook` before `express.json()`.
4. **Idempotent Database Synchronization**: Webhook events (`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`) update the existing Prisma `Subscription` table idempotently.

---

## 2. Environment Variables

Configure these variables in your root `.env` file:

```env
# Stripe Sandbox / Test Mode Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_MONTHLY_PRICE_ID=price_monthly_id_here
STRIPE_ANNUAL_PRICE_ID=price_annual_id_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
STRIPE_APP_URL=http://localhost:3000

# Frontend API URL
NEXT_PUBLIC_API_URL=http://localhost:4000
```

> [!WARNING]
> Never commit live or real test secret keys to git repositories.

---

## 3. Product & Pricing Configuration in Stripe

According to the PRD:
- **Product Name**: `RankAutonomous Complete`
- **Monthly Recurring Price**: `$199.00 USD / month`
- **Annual Recurring Price**: `$1,788.00 USD / year` ($149/month equivalent, saving $600/year)

### How to create these in your Stripe Dashboard (Test Mode):
1. Go to **Stripe Dashboard** → Ensure **Test Mode** toggle is **ON**.
2. Navigate to **Product Catalog** → Click **Add Product**.
3. Set Name to `RankAutonomous Complete`.
4. Add Pricing 1: `$199.00`, Recurring, Billing period: `Monthly`. Save and copy the Price ID (`price_...`) to `STRIPE_MONTHLY_PRICE_ID`.
5. Add Pricing 2: `$1,788.00`, Recurring, Billing period: `Yearly`. Save and copy the Price ID (`price_...`) to `STRIPE_ANNUAL_PRICE_ID`.

---

## 4. Local Webhook Forwarding with Stripe CLI

To test webhook events locally:

1. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli).
2. Login to your Stripe account:
   ```bash
   stripe login
   ```
3. Forward events to your local API server:
   ```bash
   stripe listen --forward-to localhost:4000/api/stripe/webhook
   ```
4. The CLI will print your webhook signing secret:
   ```
   > Ready! Your webhook signing secret is whsec_xxxxxxxxxx
   ```
5. Set `STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxx` in your `.env` file.

---

## 5. Endpoints Implemented

| Method | Route | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/billing/create-checkout-session` | Yes | Initiates Stripe Checkout in `subscription` mode for `monthly` or `annual`. |
| `POST` | `/api/billing/create-portal-session` | Yes | Generates Stripe Customer Portal session URL for subscription & invoice management. |
| `GET` | `/api/billing/subscription` | Yes | Returns authenticated user's current subscription record and active status. |
| `POST` | `/api/stripe/webhook` | No (Signature Verified) | Receives raw events from Stripe and synchronizes database subscriptions. |

---

## 6. Testing

Run the automated test suite covering auth, RBAC, billing, and subscription guards:

```bash
npm run test
```

This verifies:
- Unauthenticated checkout rejected (401)
- Monthly checkout strictly maps to `STRIPE_MONTHLY_PRICE_ID`
- Annual checkout strictly maps to `STRIPE_ANNUAL_PRICE_ID`
- Arbitrary price IDs rejected (400)
- Missing billing customer handled safely
- Invalid webhook signature rejected (400)
- Webhook subscription synchronization (Prisma)
- Tenant data isolation between customers
- Subscription requirement guards and Admin bypass
