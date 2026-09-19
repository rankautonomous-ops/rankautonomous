# Backlink Verification API

## Overview

The Backlink Verification API allows authenticated and subscribed users to request a verification check on an existing backlink. Verification is performed asynchronously via the PostgreSQL-backed BackgroundJob queue to ensure safe, scalable, and isolated execution.

## Endpoint

**`POST /api/websites/:websiteId/backlinks/:backlinkId/verify`**

### Authentication & Authorization

- **Authentication Requirement**: Requests must include a valid Bearer token (`requireAuth`).
- **Subscription Requirement**: The authenticated user must have an active subscription (`requireSubscription`).
- **Tenant Isolation**: The endpoint verifies that the `:websiteId` belongs strictly to the authenticated user. Furthermore, it validates that `:backlinkId` belongs to `:websiteId`. If either condition is unmet (e.g., attempting to verify another user's backlink or a non-existent resource), the API safely responds with a generic `404 Not Found` to prevent resource enumeration and cross-tenant leakage.

### Request Format

- **Headers**: 
  - `Authorization: Bearer <token>`
- **Parameters**: 
  - `websiteId` (UUID): The ID of the website the backlink belongs to.
  - `backlinkId` (UUID): The ID of the backlink to verify.
- **Body**: None required.

### Response Format

When a verification job is successfully queued or already exists in a pending state, the API responds with a `202 Accepted`.

```json
{
  "success": true,
  "message": "Backlink verification queued",
  "jobId": "f905d02c-7380-41cc-be4c-d8111b27f158",
  "backlinkId": "2fb6c23a-9823-48b5-9f45-64aa7239970e",
  "verificationStatus": "UNVERIFIED"
}
```
*Note: If the backlink already had a pending job (either `QUEUED` or `PROCESSING`), the response message will state `"Backlink verification already queued"` and return the existing `jobId` rather than duplicating jobs.*

### Duplicate-Job Behavior and Rate Limiting

- **Idempotency/Duplicate Prevention**: Before creating a new background job, the API checks the database for any `BACKLINK_VERIFICATION` jobs matching the provided `backlinkId` that are currently in a `QUEUED` or `PROCESSING` state. If such a job exists, the API simply acknowledges the request and returns the ID of the existing job.
- **Completed/Failed Jobs**: If previous jobs for the backlink are `COMPLETED`, `FAILED`, or `CANCELLED`, the system allows creating a new verification job. 
- **Rate-Limiting**: Global per-user API rate-limiting handles basic abuse prevention. The strict duplicate-job prevention serves as a localized rate limit, effectively preventing a user from queuing unlimited redundant verifications for the same backlink simultaneously.

### Background Job Execution

When a new verification request is accepted, a job is appended to the PostgreSQL `BackgroundJob` table.

- **Job Type**: `BACKLINK_VERIFICATION`
- **Job Payload**: 
  ```json
  {
    "backlinkId": "2fb6c23a-9823-48b5-9f45-64aa7239970e"
  }
  ```
- **Security Considerations**: The payload explicitly does **NOT** contain `userId`, credentials, API tokens, or URL data. The worker dynamically fetches the backlink's required target and source URLs during execution, guaranteeing that the job acts on the most up-to-date and authorized state.

### State Mutation Rules

- The `status` and `verificationStatus` fields on the `Backlink` are intentionally left **unchanged** when queuing the job. 
- State mutation is strictly delegated to the background worker (`verifyBacklink` service), avoiding premature "verifying" states that are not represented in the canonical schema.

### Error Responses

- **`401 Unauthorized`**: Missing or invalid authentication token.
- **`403 Forbidden`**: User lacks an active subscription.
- **`404 Not Found`**: Resource does not exist or user lacks ownership (Tenant isolation boundary).
- **`500 Internal Server Error`**: Unhandled exception.
