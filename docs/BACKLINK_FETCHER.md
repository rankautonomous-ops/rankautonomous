# SSRF-Protected Backlink Fetch Client

The Backlink Fetcher (`apps/api/src/services/backlinks/backlinkFetcher.ts`) is a secure, reusable HTTP client designed specifically to safely retrieve remote webpages for backlink verification, while strictly mitigating Server-Side Request Forgery (SSRF) and DNS-rebinding attacks.

## Security Model

### DNS-Rebinding Protection
We do **not** rely on checking a hostname before passing it to `fetch()`. A malicious server could resolve a hostname to a safe IP during validation, but return a private internal IP (like `127.0.0.1` or an AWS Metadata address) when the actual connection is established a millisecond later.

**How we prevent this:**
We use Node's native `http.Agent` and `https.Agent` with an overridden `lookup` function (`safeLookup`). When the socket resolves the hostname to establish the actual connection, `safeLookup` intercepts the resolved IP. It synchronously verifies if the IP is a private/internal address using `isPrivateIP()`. If it is dangerous, the connection is instantly aborted (`SSRF_BLOCKED`) before the socket can bind. This completely eliminates the Time-Of-Check to Time-Of-Use (TOCTOU) vulnerability inherent to DNS rebinding.

### SSRF Protections
The fetcher strictly rejects:
- Localhost (`127.0.0.0/8`, `::1`)
- Private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`)
- Link-local and metadata addresses (`169.254.0.0/16`, `fe80::/10`)
- Cloud metadata / CGNAT (`100.64.0.0/10`)
- All unspecified and broadcast addresses (`0.0.0.0/8`, `::/128`)

We also pre-validate the URL string (`validateUrlPreflight`) to ensure it only uses `http:` or `https:` and rejects dangerous protocols (`javascript:`, `file:`, `ftp:`).

## Redirection Policy
The fetcher manually handles redirects (301, 302, 303, 307, 308) to ensure security guarantees persist across the redirect chain.
- **Limit:** Maximum 3 redirects. Exceeding this returns a `TOO_MANY_REDIRECTS` error.
- **Security:** Each redirect target undergoes the exact same SSRF and DNS-rebinding validation as the original request.
- **Loops:** Handled gracefully by the hard limit of 3.

## Size and Timeout Limits
- **Response Size:** Maximum 5 MB (`MAX_BODY_SIZE`). The limit is enforced while streaming the chunks. If exceeded, the socket is immediately destroyed (`req.destroy()`) and a `TOO_LARGE` error is returned. This prevents out-of-memory (OOM) Denial of Service attacks.
- **Timeout:** 10 seconds (`TIMEOUT_MS`). The request aborts if no response is received within this window, freeing the socket and returning `TIMEOUT`.

## Robots.txt Policy
Before fetching any page, the fetcher resolves the origin's `robots.txt` safely (using the same SSRF protections) and checks if the `RankAutonomousBot/1.0` User-Agent is allowed.
- If allowed, or if `robots.txt` is missing/unreachable (e.g. 404/500), the fetch proceeds.
- If disallowed, the fetch is aborted with a `ROBOTS_BLOCKED` error.
- Note: A `ROBOTS_BLOCKED` error does not imply the backlink is missing, it only means the automated system cannot verify it.

## API / Result Structure

The fetcher always returns a structured `FetchResult` rather than throwing errors. This allows the consumer to safely pattern-match the outcome without try-catch hell.

```typescript
export interface FetchResult {
  success: boolean;
  finalUrl: string;
  statusCode?: number;
  contentType?: string;
  body?: string;
  redirectCount: number;
  errorCode?: FetchErrorCode;
  errorMessage?: string;
}
```

## Known Limitations / Tradeoffs
- Because we use native `http`/`https` with a custom Agent, we do not support HTTP/2 or HTTP/3 yet. For standard HTML page crawling, HTTP/1.1 is fully sufficient.
- 5 MB may truncate extremely large web pages, but this is a necessary constraint to prevent memory exhaustion across many concurrent worker jobs.
