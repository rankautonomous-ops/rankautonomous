# Backlink Worker Concurrency

## Overview

The RankAutonomous background worker (`apps/api/src/worker.ts`) now utilizes a bounded concurrency pool. This enables a single worker instance to process multiple `BackgroundJob` records in parallel, vastly increasing throughput—especially critical for processing daily stale backlink checks that can queue hundreds of `BACKLINK_VERIFICATION` jobs at once.

## Configuration

Concurrency is configured dynamically via environment variables:

| Variable | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- |
| `BACKLINK_WORKER_CONCURRENCY` | `5` | `1` to `50` | The maximum number of background jobs that one worker instance can actively process simultaneously. |

*Note: If the environment variable is omitted, negative, `NaN`, or otherwise invalid, the worker will safely clamp the value to the default of 5. It is also strictly clamped to a hard upper bound of 50 to prevent unbounded parallelism that could overwhelm database connection pools or OS file descriptors.*

## Worker Concurrency Model

- **Bounded Pool (`Set<Promise<void>>`)**: The worker maintains a dynamic `Set` of active promises representing executing jobs.
- **Polling Behavior**: While the size of the set is below the configured concurrency limit, the worker will continuously attempt to claim a new job from PostgreSQL using the existing atomic `FOR UPDATE SKIP LOCKED` mechanism.
- **Throttling**: If the pool reaches maximum capacity, `Promise.race()` is employed to wait until at least one job completes before the worker attempts to claim any more.
- **Safe Isolation**:
  - A slow job (e.g., a 10-second hanging HTTP request) will merely consume 1 slot in the pool. It will not block the remaining slots from claiming and processing faster jobs.
  - An unhandled exception or crash inside one job will not terminate the worker event loop; the slot is gracefully freed in the `finally` block for the next claim.
- **Job Agnostic**: The concurrency pool treats all job types equally. `GOOGLE_SYNC`, `SEO_CRAWL`, `AI_ARTICLE_GENERATION`, and `BACKLINK_VERIFICATION` all share this pool and are executed in parallel safely.

## Retry Behavior

The concurrent upgrade strictly preserves the existing error handling semantics provided by `QueueService`. Transient fetch errors or connection drops will trigger `failJob()`, initiating the standard exponential backoff delay before re-queueing. Permanent errors (`ERROR`, `MISSING`) are evaluated normally.

## Graceful Shutdown

To prevent data corruption during deployments or instance terminations:
- The worker listens for OS-level `SIGTERM` and `SIGINT` signals.
- When received, the main polling loop sets `isShuttingDown = true` and halts further polling.
- The script immediately executes an `await Promise.allSettled(activeJobs)` on the remaining pool.
- The worker will pause and allow all actively executing jobs to drain/finish cleanly before fully exiting the Node process.

## Scaling Considerations

For the initial rollout, a concurrency of `5` is perfectly sufficient for 100-500 nightly backlink checks.

If the queue scales to 1,000,000+ backlinks:
- The worker concurrency can be increased up to `50`.
- CPU/Memory utilization of the Render Background Worker tier must be monitored.
- PostgreSQL max connections (`pool_size`) must be appropriately scaled to handle `WORKER_CONCURRENCY` simultaneous Prisma transactions per node.
