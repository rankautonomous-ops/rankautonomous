# Backlink Verification Schema

## Overview

The `Backlink` model has been extended to independently track the verification state (whether a link exists) and its SEO link attributes (whether it passes link equity).

A manually recorded backlink starts as `UNVERIFIED`.
**Important:** Schema state does not prove the backlink exists on the source page until an automated worker successfully verifies it.

## Fields Added

### `verificationStatus`
**Type:** `BacklinkVerificationStatus` (Enum)
**Default:** `UNVERIFIED`
**Values:**
- `UNVERIFIED`: The backlink has been manually recorded but not yet checked by the system.
- `VERIFIED`: The system found the target link on the source page.
- `MISSING`: The system successfully fetched the source page, but the target link was not found.
- `ERROR`: The system encountered a failure preventing verification (e.g., 404, DNS failure, timeout).

> Note: This is strictly distinct from the existing `status` field, which indicates whether the backlink record itself is "ACTIVE" or "LOST" in the CRM. The `status` field is preserved to maintain backward compatibility with existing API/UI clients (Step 12B/12C).

### `linkAttributes`
**Type:** `String[]`
**Default:** `[]`
**Values:** Array containing any combination of `NOFOLLOW`, `SPONSORED`, or `UGC`.

If the array is empty (`[]`), it means no special `rel` attributes were detected on the anchor tag. It is implicitly "Dofollow", but we do not store a false "DOFOLLOW" string to strictly reflect the HTML source.

### `lastErrorMessage`
**Type:** `String?`
**Default:** `null`
**Description:** A safe explanation of the most recent verification failure (e.g., "Source page returned HTTP 404").

### `lastChecked`
**Type:** `DateTime`
**Default:** `now()`
**Description:** Reused from the original schema. The timestamp of the most recent verification attempt.

## Migration Approach

- **Safe Defaults:** `verificationStatus` is added with a default of `UNVERIFIED`. `linkAttributes` defaults to `[]`. This ensures no existing data claims to be verified falsely.
- **Data Preservation:** The existing `status` field is untouched. All existing records (if any) are perfectly preserved.

## Future Worker Expectations

The background verification worker (Step 12E) is expected to:
1. Query backlinks where `verificationStatus = UNVERIFIED` or `lastChecked` is stale.
2. Fetch the source URL safely.
3. Parse the HTML to find the link and extract its `rel` attributes.
4. Update `verificationStatus`, `linkAttributes`, `lastChecked`, and `lastErrorMessage` based on the result.
