# AI Content Engine & Content Workflow (Step 6G)

## 1. Overview
The RankAutonomous AI Content Engine is an automated, high-integrity content generation and workflow system. It supports the complete article lifecycle from keyword/topic idea to draft generation, AI review, human editorial review, approval, and publication tracking.

The engine reuses the unified `IAiProvider` / `GeminiProvider` abstraction, guarantees server-side HTML/slug sanitization, prevents metric/citation fabrication, and enforces strict internal-link validation against crawler-discovered pages.

---

## 2. Architecture

```
User / API Request 
       │
       ▼
REST Endpoints (/api/websites/:id/articles)
       │ (Ownership & Subscription Validation)
       ▼
Prisma Database (Article & AiJob records)
       │
       ├──► Asynchronous Job Dispatch (AiJob: QUEUED -> PROCESSING)
       │           │
       │           ▼
       │     aiContent Service (apps/api/src/services/aiContent/)
       │           │
       │           ├── Fetch Crawl Data (PageResult: valid crawled URLs)
       │           ├── Build Injection-Guarded Prompt (prompt.ts)
       │           ├── Invoke IAiProvider (GeminiProvider / OpenAiCompatibleProvider)
       │           ├── Strict JSON Output Validation & HTML Sanitization (schema.ts)
       │           ├── Internal Links Verification (filter against PageResult)
       │           └── Update Article & Mark AiJob COMPLETED / FAILED
       │
       ▼
Frontend Content Workspace (/app/content)
       ├── Content Dashboard (Article listing & filtering by status)
       ├── Create Article Modal (Keyword, topic, tone, length configuration)
       └── Article Workspace (Editor, outline, verified links, AI review, workflow transitions)
```

---

## 3. Article Lifecycle & Workflow State Machine

Articles progress through controlled workflow states:

```
[ IDEA ] ───────────► [ DRAFT ]
                        │    ▲
                        ▼    │ (Return for edits)
                   [ USER_REVIEW ] ◄──── [ AI_REVIEW ]
                        │
                        ▼
                   [ APPROVED ] ────────► [ PUBLISHED ]
```

### Transition Rules:
1. **`IDEA`**: Initial state upon configuration. Can transition to `DRAFT` (or initiate generation).
2. **`DRAFT`**: Generated content or manual draft. Can transition to `AI_REVIEW` or `USER_REVIEW`.
3. **`AI_REVIEW`**: Active AI review analysis. Automatically advances to `USER_REVIEW` upon completion.
4. **`USER_REVIEW`**: Editorial review phase displaying AI score and recommendations. Can transition to `APPROVED` or return to `DRAFT`.
5. **`APPROVED`**: Ready for distribution. Can transition to `PUBLISHED` (or reopen review).
6. **`PUBLISHED`**: Terminal state in Step 6G representing editorial publication. Arbitrary forward jumps are rejected.

---

## 4. API Endpoints

All article endpoints require authentication (`requireAuth`), active subscription (`requireSubscription`), and strict website ownership verification (`checkWebsiteOwnershipLocal`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/websites/:id/articles` | List articles for website (supports `?status=` query filter) |
| `GET` | `/api/websites/:id/articles/:articleId` | Get article details and active job status (`latestJob`) |
| `POST` | `/api/websites/:id/articles` | Create a new article configuration |
| `PUT` | `/api/websites/:id/articles/:articleId` | Update article metadata and content (server-side sanitized) |
| `DELETE` | `/api/websites/:id/articles/:articleId` | Delete article |
| `POST` | `/api/websites/:id/articles/:articleId/generate` | Queue async AI content generation (`202 Accepted`) |
| `POST` | `/api/websites/:id/articles/:articleId/review` | Queue async AI content review (`202 Accepted`) |
| `POST` | `/api/websites/:id/articles/:articleId/transition` | Enforce valid workflow state transition |

---

## 5. AI Provider Reuse

The content engine does **not** instantiate a secondary Gemini or OpenAI client. It calls:
```typescript
import { getAiProvider } from '../aiProvider';

const ai = getAiProvider();
const response = await ai.generateCompletion({
  systemPrompt,
  userPrompt,
  responseFormat: 'json_object',
  temperature: 0.7,
  maxTokens: 4000
});
```
This guarantees consistent retry policies, fallback logic (`gemini-3.6-flash`), and centralized credential handling.

---

## 6. Generation & Review Flow

### Generation Flow (`generateArticle`)
1. Fetches the article and associated website.
2. Queries the latest completed crawl job for up to 100 successful URLs (`PageResult`).
3. Constructs bounded prompt with explicit anti-injection instructions.
4. Invokes the AI provider requesting strict JSON format:
   ```json
   {
     "title": "SEO Title",
     "metaDescription": "Meta description",
     "slug": "url-slug",
     "headings": ["H2: ...", "H3: ..."],
     "content": "<p>Semantic HTML...</p>",
     "internalLinks": ["https://example.com/page"],
     "imageSuggestions": ["Diagram of ..."],
     "cta": "Call to action"
   }
   ```
5. Server validates schema (`validateContentGenerationOutput`):
   - Sanitizes HTML to eliminate `<script>`, `<iframe>`, `on*` event handlers, and `javascript:` URLs.
   - Cleans URL slug (lowercase alphanumeric with hyphens).
   - Bounds title, meta description, headings, and content lengths.
6. Filters `internalLinks` against known crawled URLs (`Set<string>`). Hallucinated or non-crawled links are discarded.
7. Computes word count and persists article in `DRAFT` status.
8. Updates `AiJob` to `COMPLETED` or `FAILED`.

### AI Review Flow (`reviewArticle`)
1. Submits article draft to AI with temperature `0.3`.
2. Evaluates SEO title, meta description, keyword alignment, readability, structure, and citation integrity.
3. Validates structured review JSON:
   ```json
   {
     "score": 85,
     "summary": "Evaluation summary",
     "strengths": ["Clear structure"],
     "issues": ["Short meta description"],
     "recommendations": ["Expand meta description"]
   }
   ```
4. Stores `aiReviewData` on article, advances status to `USER_REVIEW`, and marks job `COMPLETED`.

---

## 7. Security Controls

- **Prompt Injection Defense**: Crawled website text, page titles, and headings are passed under a strict `DATA, NOT INSTRUCTIONS` directive.
- **HTML Sanitization**: Server-side tag stripping ensures no malicious scripts or iframes can be stored or rendered.
- **Bounded Inputs & Outputs**: Word count bounded between 100 and 5,000; content capped at 50,000 characters; slugs bounded to 100 characters.
- **Internal Link Validation**: AI is prevented from inventing internal URLs; only verified URLs from `PageResult` are saved.
- **External Reference Safety**: External citations are treated as suggestions/placeholders requiring human verification; fabricated studies or statistics are prohibited.
- **Tenant Isolation**: Queries strictly filter by `website.userId === req.user.id`.
- **Error Sanitization**: Errors written to `AiJob.error` are scrubbed of API keys, bearer tokens, and internal database details.

---

## 8. Known Limitations & Future Work (Step 6H)
- **CMS Publishing**: Actual WordPress, Shopify, and Webflow webhook/REST publishing is deferred to Step 6H. Currently, `PUBLISHED` represents an editorial workflow state.
- **Scheduled Auto-Generation**: Daily 1-article generation scheduler will be integrated with `pg_cron` / background workers in subsequent phases.
