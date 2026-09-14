# RankAutonomous

RankAutonomous is an AI-powered SEO automation platform that allows users to connect their website and have the platform continuously analyze, research, create, optimize, and execute SEO activities.

## Product Vision
The core product vision is to automate SEO workflows to help businesses increase organic search traffic through a simple four-step process:
**ANALYZE → CREATE → BUILD → GROW**

## Main User Journey
LANDING PAGE → SIGN UP → CHOOSE PLAN → STRIPE CHECKOUT → ONBOARDING → CONNECT WEBSITE → WEBSITE ANALYSIS → SEO SCORE → AI SEO STRATEGY → KEYWORD RESEARCH → CONTENT PLAN → DAILY AI ARTICLE → USER APPROVAL → PUBLISH → BACKLINK OPPORTUNITIES → SEO/TRAFFIC MONITORING → MONTHLY REPORT → CONTINUOUS AUTOMATION

## Technology Stack
- **Frontend**: React (Next.js), TypeScript, Modern CSS
- **Backend**: Node.js (Express), TypeScript, REST API
- **Database**: PostgreSQL
- **Authentication**: Secure managed authentication (Supabase)
- **Payments**: Stripe
- **Hosting**: Hostinger environment (with external managed services where necessary)

## Repository Structure
This repository uses a monorepo structure with npm workspaces:
- `apps/web/`: Next.js frontend application (Customer & Admin UI)
- `apps/api/`: Node.js Express backend application (REST API)
- `packages/shared/`: Shared TypeScript types, interfaces, and utilities
- `packages/config/`: Shared configuration files (ESLint, TSConfig, etc.)
- `docs/`: Architecture and PRD traceability documentation
- `database/`: Database migration and schema files
- `scripts/`: Development and automation scripts

## Local Development Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)
- PostgreSQL database

## Environment Configuration
Copy `.env.example` to `.env` and fill in the required variables for your local development environment.
```bash
cp .env.example .env
```

## Development Commands
- **Install dependencies**: `npm install`
- **Start all apps in dev mode**: `npm run dev`
- **Start frontend only**: `npm run dev --workspace=web`
- **Start backend only**: `npm run dev --workspace=@rankautonomous/api`

## Build Commands
- **Build all apps**: `npm run build`
- **Build frontend**: `npm run build --workspace=web`
- **Build backend**: `npm run build --workspace=@rankautonomous/api`

## Current Implementation Status
- Step 1: Production-oriented project foundation established. Repository structure, workspaces, Next.js web app, and Node.js API are initialized.
- Step 2: Database and ORM foundation implemented.

## Future Implementation Phases
- Authentication and User Onboarding
- Website Connection & Analysis
- AI Strategy & Content Generation
- Background Automation Jobs

