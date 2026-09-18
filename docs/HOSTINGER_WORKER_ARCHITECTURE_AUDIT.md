# RankAutonomous: Hostinger Background Worker Architecture Audit

**AUDIT STATUS:** COMPLETE

## 1. Executive Summary
RankAutonomous requires a durable background job execution system for long-running tasks (AI generation, SEO crawling, and Google API synchronization). To avoid third-party paid services like Trigger.dev and to minimize infrastructure complexity, this architecture proposes a robust, self-hosted Node.js worker process. 

**Core Answers:**
1. **Can we build this without Redis?** Yes. PostgreSQL 9.5+ natively supports `SELECT ... FOR UPDATE SKIP LOCKED`, which acts as an incredibly robust, race-condition-free message queue.
2. **Can we build this without Trigger.dev?** Yes. We will build a lightweight Node.js worker process that polls PostgreSQL.
3. **Can PostgreSQL handle the queue for the expected RankAutonomous MVP workload?** Easily. Postgres can reliably process thousands of concurrent queue locks per second, far exceeding our initial needs.
4. **What is the simplest reliable architecture?** A dual-process Docker deployment (Express API + Node.js Worker) communicating exclusively through the Postgres `BackgroundJob` table.
5. **What should we implement first?** The `BackgroundJob` Prisma model and the base generic worker polling loop.

---

## 2. Current RankAutonomous Background Architecture
Presently, jobs like `startCrawl()` and `generateArticle()` are invoked directly in the Express API routes. 
- **The Risk:** They run as fire-and-forget Promises in the Node.js event loop. If the Hostinger VPS reboots, or the Node process crashes, any in-flight job is permanently lost. Furthermore, heavy operations (like HTML parsing in Cheerio) block the main thread, making the API unresponsive.

## 3. Current Job Models
- The existing `AiJob` and `CrawlJob` models contain excellent business-logic fields (e.g., `totalUrls`, `status`, `result`). 
- **Recommendation:** Do **not** use them as the primary queue mechanism. They lack distributed locking fields (`lockedAt`, `lockedBy`, `nextRunAt`). Instead, introduce a generic `BackgroundJob` model. The generic queue will execute the job, which in turn updates the business models (`AiJob`/`CrawlJob`).

## 4. Recommended Queue Architecture
**Pattern:**
```
API Route -> INSERT BackgroundJob -> (Database) <- Polling Node.js Worker -> Existing Service Logic
```
The Express API handles user requests rapidly by inserting a record into PostgreSQL and immediately returning `202 Accepted`. The Worker process picks it up asynchronously.

## 5. PostgreSQL Queue Design
Job claiming requires absolute protection against race conditions. We will use the following SQL pattern natively supported by Prisma via `$queryRaw`:
```sql
UPDATE "BackgroundJob" 
SET status = 'PROCESSING', "lockedAt" = NOW(), "lockedBy" = $workerId 
WHERE id = (
  SELECT id FROM "BackgroundJob" 
  WHERE status = 'QUEUED' AND "nextRunAt" <= NOW() 
  ORDER BY priority DESC, "createdAt" ASC 
  LIMIT 1 
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

## 6. Job Lifecycle
1. **QUEUED:** Inserted by API or Scheduler. `nextRunAt` determines when it becomes eligible.
2. **PROCESSING:** Claimed by the Worker. `lockedAt` is populated.
3. **COMPLETED:** Worker finishes execution successfully.
4. **FAILED:** Worker catches an error, and retries are exhausted.
5. **CANCELLED:** User explicitly terminates the job.

## 7. Job Locking
Protection against two workers processing the same job is guaranteed by PostgreSQL's `FOR UPDATE SKIP LOCKED`. If Worker A locks Job 1, Worker B's query will immediately skip Job 1 and lock Job 2.

## 8. Retry Strategy
If the existing service (e.g., `generateArticle`) throws an error (e.g., an AI API timeout), the generic Worker catches it. It increments the `attempts` counter. If `attempts < maxAttempts`, it resets the status to `QUEUED` and calculates a new `nextRunAt` with exponential backoff.

## 9. Failure Recovery (Stale Jobs)
If the Hostinger VPS undergoes a hard crash, a job might be stuck in `PROCESSING`. 
- **Solution:** The worker loop runs a routine cleanup query on startup and every 5 minutes:
`UPDATE "BackgroundJob" SET status = 'QUEUED' WHERE status = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '1 hour';`

## 10. Idempotency
Because jobs can be retried, the underlying services must be idempotent. 
- E.g., the `syncGoogleIntegrations()` uses `upsert`, which is natively idempotent. 
- Existing services do not require heavy rewriting, but we must ensure they safely overwrite or ignore duplicate data if run twice.

## 11. Scheduling Architecture
We will introduce a lightweight `node-cron` (or equivalent) scheduler running in a singleton fashion (either in a dedicated container or as the primary worker thread). 
- **Crucial Rule:** The Cron scheduler **never executes jobs**. It only executes `INSERT INTO "BackgroundJob"` (enqueueing). The worker executes them.

## 12. Google Sync Architecture
- **Nightly Sync:** The scheduler enqueues a `GOOGLE_SYNC` job for all active websites daily at 2:00 AM. 
- The worker claims these and passes them to the existing `syncGoogleIntegrations()` function.

## 13. SEO Crawl Architecture
- **Scheduled/Manual Crawl:** API enqueues `SEO_CRAWL` with the `websiteId` payload. 
- The worker executes `startCrawl()`. 
- **Concurrency:** Crawling is CPU/Network intensive. The worker will restrict concurrent crawler jobs tightly (e.g., max 2 at a time).

## 14. AI Content Architecture
- **Daily Generation:** API or Scheduler enqueues `AI_ARTICLE_GENERATION`. 
- The worker calls `generateArticle()`. Handles 429 Rate Limits from AI providers cleanly by utilizing the Retry Strategy (Section 8).

## 15. Backlink Job Architecture
- Enqueues `BACKLINK_DISCOVERY`. Similar asynchronous execution mapping to existing discovery services.

## 16. Monthly Report Architecture
- A Cron expression (e.g., `0 0 1 * *`) enqueues `REPORT_GENERATION` jobs for all active customers.

## 17. Worker Process Architecture
- A distinct Node.js entry point (`apps/api/src/worker.ts`). 
- Initializes its own Prisma connection. 
- Runs a continuous `setInterval` polling loop querying the Postgres lock. 
- Manages an internal concurrency limit (e.g., utilizing `p-limit` or strict array processing) to prevent memory exhaustion.

## 18. API Process Architecture
- The existing Express API (`apps/api/src/index.ts`). 
- Completely relieved of heavy background tasks. Becomes incredibly fast and resilient.

## 19. Docker Architecture
A `docker-compose.yml` defining three services:
1. `web`: Next.js frontend (Port 3000)
2. `api`: Express API (Port 4000)
3. `worker`: Node.js Worker (No exposed ports)

## 20. Hostinger VPS Architecture
- A standard Linux VPS (Ubuntu 22.04/24.04).
- Docker and Docker Compose installed.
- No Redis required.
- No local database required (using existing Supabase Postgres).

## 21. Nginx Architecture
- Installed directly on the Hostinger VPS.
- Acts as a reverse proxy. 
- Routes `/api/*` traffic to the `api` container. 
- Routes `/` traffic to the `web` container.
- Manages SSL termination via Let's Encrypt Certbot.

## 22. Cron Architecture
- Embedded inside the `worker` process as a singleton, executing lightweight database inserts using `node-cron`.

## 23. Concurrency & Rate Limits
- **Worker Concurrency Limit:** Configurable via env var (e.g., `WORKER_CONCURRENCY=5`). 
- **Google API:** Handles 429s natively by failing the job and relying on exponential backoff.
- **AI Providers:** Same as Google API.
- **Crawler:** Uses strict timeouts defined in existing crawler configs.

## 24. Security & Tenant Isolation
- The worker process has zero exposed HTTP ports, rendering it immune to direct external attacks.
- Tenant isolation remains intact because the worker executes the exact same isolated service functions the API used.

## 25. Environment Variables
No new external services are required. The worker requires the exact same environment variables as the API:
- `DATABASE_URL` (Connection pool for rapid queries)
- `DIRECT_URL`
- `AI_PROVIDER_API_KEY`
- Google OAuth secrets, etc.

## 26. Database Changes
A new schema model is required:
```prisma
model BackgroundJob {
  id          String    @id @default(uuid())
  type        String    // e.g., 'GOOGLE_SYNC', 'SEO_CRAWL'
  payload     Json
  status      String    @default("QUEUED") // QUEUED, PROCESSING, COMPLETED, FAILED, CANCELLED
  attempts    Int       @default(0)
  maxAttempts Int       @default(3)
  nextRunAt   DateTime  @default(now())
  lockedAt    DateTime?
  lockedBy    String?
  error       String?   @db.Text
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@index([status, nextRunAt])
}
```

## 27. Package Changes
- Install `node-cron` (or `cron`) in `apps/api/package.json` for scheduling. 
- No heavy queue packages (like BullMQ) are required.

## 28. Deployment Strategy
- SSH into Hostinger.
- `git pull`
- `docker compose up -d --build`
- Docker natively handles process supervision (`restart: always`), recovering the worker immediately if a fatal exception occurs.

## 29. Monitoring & Logging
- The worker outputs structured console logs. 
- `docker logs rankautonomous-worker-1 -f` handles monitoring. 
- The `BackgroundJob` table acts as a persistent historical log of all executions and failures.

## 30. Risks & Limitations
- **Postgres Polling:** A highly aggressive polling loop (e.g., checking every 100ms) could add overhead to Supabase. **Mitigation:** A sensible polling interval (e.g., 5 seconds) is perfectly acceptable for background tasks and practically invisible to Postgres.
- **Memory Leaks:** Long-lived Node processes parsing heavy HTML can leak memory. **Mitigation:** Docker restart policies combined with reasonable worker concurrency.

## 31. Implementation Phases
*DO NOT IMPLEMENT YET*
- **Phase 1:** Add `BackgroundJob` to Prisma schema and generate client.
- **Phase 2:** Build the `QueueService` (enqueue, dequeue/lock, complete, fail).
- **Phase 3:** Build the `worker.ts` continuous polling loop.
- **Phase 4:** Refactor API routes (`integrations.ts`, `website.ts`) to enqueue jobs instead of executing promises.
- **Phase 5:** Build the `cron.ts` scheduler for nightly operations.
- **Phase 6:** Construct the `docker-compose.yml` and Nginx configurations.

## 32. Manual Actions Required
- Ensure the Hostinger VPS is provisioned and SSH access is available.
- Install Docker and Docker Compose on the VPS.
- Point the domain's DNS A-records to the VPS IP address.

## 33. Final Recommendation
The proposed custom PostgreSQL queue architecture is incredibly robust, highly scalable for our MVP, and completely eliminates the need for expensive or complex external dependencies like Trigger.dev or Redis. It maximizes our existing Supabase investment.

---

**AUDIT STATUS:** COMPLETE

**RECOMMENDED NEXT STEP:**
Implement Phase 1 and Phase 2. This involves updating the Prisma Schema with the `BackgroundJob` model and writing the core `QueueService` class containing the `SKIP LOCKED` SQL logic.

**MANUAL ACTION REQUIRED:**
No manual action is required right now to begin writing the code. You will only need to perform manual VPS setup during the final deployment phase.
