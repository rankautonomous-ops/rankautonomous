# Keyword Research Engine

## Architecture

The Keyword Research Engine provides a centralized way to normalize, store, and enrich keywords for a user's website. It handles keywords from multiple sources (User, AI, future Providers) and explicitly manages the availability of metrics like search volume and keyword difficulty.

### Data Model
- **Keyword**: Stores the keyword and deterministic metrics.
  - `normalizedKeyword`: Used to enforce uniqueness per website (e.g. `seo tools` and `SEO Tools!` are identical).
  - `status`: `ACTIVE` or `ARCHIVED`.
  - `source`: Tracks the origin (`USER_ENTERED`, `AI_SUGGESTED`, etc.).
  - `cluster`: Simple string representing the deterministic cluster group.

### Provider Abstraction
The system defines `IKeywordResearchProvider`.
- Currently, NO real external provider is integrated.
- A `MockKeywordProvider` is exclusively used for automated tests.
- When `POST /api/websites/:id/keywords/research` is called without a provider, the system explicitly returns `503 Service Unavailable` with `NOT_CONFIGURED`, signaling that the data is not available instead of fabricating data.

### Metric Availability & Opportunity Score
- The engine uses `NULL` to represent metrics that have not been provided yet (e.g., Search Volume, Keyword Difficulty, Current Ranking).
- **Opportunity Score Formula**:
  `Score = (log(searchVolume) * IntentMultiplier) / (keywordDifficulty + 1)` mapped to a 0-100 scale.
  - Requires `searchVolume` and `keywordDifficulty`. If either is unavailable (`NULL`), the opportunity score is explicitly `NULL` (`NOT_EVALUATED`).

### Clustering
- Uses a deterministic stem-like overlap algorithm. If keyword A contains keyword B (length > 3), they are grouped under B.
- Cannot establish semantic clustering without a real AI model, so short or isolated words remain `Unclustered` (`null`).

## API Endpoints

- `GET /api/websites/:id/keywords`: Fetch all active keywords.
- `POST /api/websites/:id/keywords`: Add keywords manually.
- `PUT /api/websites/:id/keywords/:keywordId`: Update a keyword (intent, targetUrl, status).
- `DELETE /api/websites/:id/keywords/:keywordId`: Soft-deletes a keyword (sets status to ARCHIVED).
- `POST /api/websites/:id/keywords/import-ai`: Imports AI suggestions gracefully handling duplicates.
- `POST /api/websites/:id/keywords/research`: Enriches keywords using the configured provider.

## Security
- Strict tenant isolation ensures users can only read, write, update, and delete keywords associated with their owned websites.
- Subscription protection middleware restricts endpoints to active subscribers.
- Target URLs are validated to prevent dangerous protocols (`javascript:`, etc.).

## Search Console Boundary
- No Google Search Console integration is implemented yet.
- `currentRanking` will remain `NULL` until genuine ranking data is supplied by a future integration. No heuristic estimations are used to fake rankings.
