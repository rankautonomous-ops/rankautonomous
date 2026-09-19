# Automatic Stale Backlink Scheduler

## Overview

The Automatic Stale Backlink Scheduler is a dedicated background script designed to run periodically (e.g., via a daily Render Cron Job). It finds acquired backlinks that haven't been verified recently or are completely unverified, and automatically queues them into the PostgreSQL `BackgroundJob` table for worker processing.

**File Location:** `apps/api/src/cron/enqueueStaleBacklinks.ts`

## Stale Definition

A backlink is considered "stale" and eligible for automatic verification if it matches **either** of the following rules:

1. **Unverified (`UNVERIFIED`)**: The backlink has never been successfully checked by the automated system.
2. **Stale (`VERIFIED`, `MISSING`, `ERROR`)**: The backlink's `lastChecked` timestamp is older than `BACKLINK_VERIFICATION_STALE_DAYS` (default 14 days), or `lastChecked` is null.

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `BACKLINK_VERIFICATION_STALE_DAYS` | 14 | Number of days before a backlink is considered stale. |
| `BACKLINK_VERIFICATION_BATCH_SIZE` | 500 | Maximum number of backlinks to process and enqueue per scheduler run. |

## Execution Behavior

- The script queries the database for stale backlinks, sorting `UNVERIFIED` links first.
- It slices the backlog into manageable chunks to prevent memory spikes.
- It executes an atomic raw SQL insertion to populate the `BackgroundJob` queue.
- The script finishes execution cleanly and terminates (Exit Code 0). It does not run infinitely.

## Duplicate Prevention (Idempotency)

Duplicate prevention is absolutely critical to avoid queue bloat. The scheduler achieves this **at the application layer without requiring schema migrations** by using PostgreSQL's atomic capabilities:

```sql
INSERT INTO "BackgroundJob" (...)
SELECT ...
WHERE NOT EXISTS (
  SELECT 1 FROM "BackgroundJob" 
  WHERE type = 'BACKLINK_VERIFICATION' 
    AND status IN ('QUEUED', 'PROCESSING') 
    AND payload->>'backlinkId' = <targetId>
)
```

This guarantees that even if the scheduler runs twice simultaneously (e.g., overlapping cron triggers), it will not create a second active job for the exact same backlink. 

## Next Run Jitter

To prevent worker congestion and distributed denial-of-service (DDoS) characteristics toward target web servers, the scheduler introduces randomized jitter to the `nextRunAt` timestamp of enqueued jobs:
- **`UNVERIFIED` backlinks**: Scheduled randomly within the next **60 minutes** (prioritized).
- **Stale backlinks**: Scheduled randomly within the next **24 hours** (load smoothed).

## Job Payload

The enqueued jobs use the existing trusted payload format strictly mapping to the database record:
```json
{
  "backlinkId": "uuid"
}
```
*No secrets, tokens, or tenant relationships (like `websiteId` or `userId`) are exposed in the JSON. The verification worker fetches this securely from the database during execution.*

## Future Scaling Considerations

- **Cursor Pagination**: Currently, the script uses a `take` (limit) up to `BATCH_SIZE` without a cursor. For millions of backlinks, true cursor pagination (`cursor: { id }`) should be introduced within the script loop.
- **Worker Starvation**: Pumping 5,000 jobs into the queue daily requires a fast worker. `apps/api/src/worker.ts` currently fetches 1 job at a time synchronously. If backlog increases, the worker concurrency must be upgraded.
