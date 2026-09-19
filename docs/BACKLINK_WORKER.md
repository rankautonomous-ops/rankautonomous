# Backlink Verification Worker Architecture

This document describes how the `BACKLINK_VERIFICATION` background job is integrated into the existing PostgreSQL-based `BackgroundJob` and worker architecture.

## 1. Job Type
- **Job Type**: `BACKLINK_VERIFICATION`
- **Location**: Queued via `QueueService.enqueue('BACKLINK_VERIFICATION', payload)`

## 2. Job Payload
The payload is deliberately minimal for security and tenant isolation:
```json
{
  "backlinkId": "uuid-string"
}
```
**Important Security Constraints**:
- The payload does **not** contain `websiteId`, `userId`, HTML content, or credentials.
- The worker uses `backlinkId` to fetch the source of truth directly from the database, preventing untrusted payloads from forcing operations on arbitrary objects.

## 3. Worker Flow
1. The worker claims the job atomically using `FOR UPDATE SKIP LOCKED`.
2. The payload is validated to ensure `backlinkId` is a string.
3. The worker queries Prisma for `Backlink` and includes the related `Website`.
4. Tenant isolation is enforced: if the backlink is missing, deleted, or disconnected from a valid website/user, the job is safely skipped and marked `COMPLETED` (dropping it without failing/looping).
5. The worker invokes `verifyBacklink(backlinkId)`.
6. Upon success, the worker marks the `BackgroundJob` as `COMPLETED`.

## 4. Error Handling & Retry Behavior

### Permanent Errors
- Includes SSRF blocks, non-HTML content, invalid URLs, robots.txt blocks, and 404/410/403 HTTP codes.
- `verifyBacklink()` updates the backlink's `verificationStatus` to `ERROR` or `MISSING`.
- The worker marks the background job as `COMPLETED` since the verification successfully determined the link's state.

### Transient Errors
- Includes 502/503/504 HTTP codes, DNS timeouts, network timeouts, or general `fetch` crashes.
- `verifyBacklink()` throws an `Error`.
- The worker catches the error and calls `QueueService.failJob()`.
- `QueueService` increments the attempt counter and calculates an exponential backoff (`nextRunAt`), resetting the status to `QUEUED`.
- If `attempts >= maxAttempts` (default 3), the job is marked `FAILED`.

## 5. Idempotency and Duplicates
- If two identical `BACKLINK_VERIFICATION` jobs are queued for the same backlink, the atomic locking ensures they execute sequentially.
- `verifyBacklink()` is fully idempotent. Executing it multiple times simply re-fetches the source page and overwrites `verificationStatus` and `lastChecked` with the latest data, introducing no data corruption.

## 6. Stale/Deleted Backlinks
- If a backlink is deleted by a user before its job executes, the worker detects the missing record in the database.
- The worker emits a warning and safely `break`s, completing the job to prevent infinite retries. It does not attempt to recreate the deleted backlink.

## 7. Next Steps
- This worker architecture forms the foundation for automated scheduling (e.g., cron jobs injecting `BACKLINK_VERIFICATION` jobs periodically).
- Front-end applications will reflect the state transitions (`UNVERIFIED` -> `VERIFIED` / `MISSING` / `ERROR`) automatically based on API queries.
