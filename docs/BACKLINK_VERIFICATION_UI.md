# Backlink Verification UI Documentation

## Overview

The Backlink Verification UI allows users to safely and efficiently request verification of their acquired backlinks directly from the Backlinks pipeline dashboard. The frontend interacts seamlessly with the asynchronous PostgreSQL `BackgroundJob` queue, polling for status updates without blocking the user interface.

## Verification Button

- Located within the "Acquired Backlinks" table under the "Actions" column.
- Triggers a `POST /api/websites/:websiteId/backlinks/:backlinkId/verify` request.
- The button is intelligently disabled during the queueing and processing phases to prevent repeated clicks and accidental queue flooding.

## API Interaction

1. **Enqueue (`POST /verify`)**: On click, a signed Supabase access token is sent to the backend. The backend checks for duplicate jobs. If queued successfully (or already queued), it returns a `202 Accepted` response with the `jobId`.
2. **Polling (`GET /verification-job`)**: If a verification is successfully queued, the frontend begins polling the backend using a dedicated `GET /api/websites/:websiteId/backlinks/:backlinkId/verification-job` endpoint.
   - The endpoint strictly isolates the query to jobs tied to the authenticated user's website and backlink.
   - Polling occurs every 2 seconds.

## Polling and Status Implementation

- **Idle**: Button displays "Verify".
- **Queueing**: Button displays "Queueing..." while the `POST` request is inflight.
- **Processing**: The polling interval detects a job in `QUEUED` or `PROCESSING` state and updates the button to "Verifying...".
- **Terminal States**: When the polling detects a `COMPLETED`, `FAILED`, or `CANCELLED` state, it halts polling and triggers a data refresh to fetch the newly persisted `verificationStatus` of the backlink.
- **Timeout Protection**: To prevent infinite loops, the polling automatically halts after 60 seconds (30 attempts). The UI gracefully alerts the user that verification is still processing in the background.

## Status Display

The UI cleanly separates the canonical `status` (ACTIVE/LOST) from the `verificationStatus`.
The Verification column features clear color-coding:
- **VERIFIED**: Green badge (`#dcfce7`, text `#166534`)
- **MISSING**: Yellow badge (`#fef08a`, text `#854d0e`)
- **ERROR**: Red badge (`#fee2e2`, text `#991b1b`)
- **UNVERIFIED**: Gray badge (`#f3f4f6`, text `#374151`)

Additionally, a "Last Checked" column presents the `lastCheckedAt` timestamp formatted logically, falling back to "Never" if the link has not been checked yet.

## Error Handling

- **UI Feedback**: Raw API errors or stack traces are explicitly suppressed. Instead, the UI displays a clean `lastErrorMessage` if the backend provided one, or falls back to a generic "Verification could not be completed."
- **Network Resilience**: 401s prompt the user regarding expired sessions; 403s notify about missing subscriptions; and 404s alert if the backlink was deleted concurrently. Polling errors (e.g., transient network drops) are silently ignored to allow subsequent polls to recover naturally.

## Accessibility

- Status colors maintain sufficient contrast and use distinct styling instead of relying solely on hues.
- Verification buttons correctly reflect the `disabled` state via DOM attributes during loading/polling.

## Manual Smoke Test Results

- Navigated to Acquired Backlinks.
- Clicked "Verify" on a newly added test backlink.
- Observed state transitions: Queueing... -> Queued -> Verifying...
- After processing, the row correctly refreshed, showing the exact terminal state (VERIFIED, MISSING, or ERROR) without a page reload.
- **Result**: PASSED.
