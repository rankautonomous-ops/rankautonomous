import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';

/**
 * Builds Wix Blog RichContent JSON structure from article text/markdown.
 * Wix RichContent represents content as an AST with nodes for paragraphs, headings, etc.
 */
function buildWixRichContent(content: string) {
  if (!content) {
    return { nodes: [{ type: 'PARAGRAPH', nodes: [{ type: 'TEXT', textData: { text: '' } }] }] };
  }

  // Split content into paragraph/heading blocks by double newlines
  const blocks = content.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  const nodes = blocks.map(block => {
    let type = 'PARAGRAPH';
    let text = block;
    let headingData: any = undefined;

    if (block.startsWith('### ')) {
      type = 'HEADING';
      headingData = { level: 3 };
      text = block.replace(/^###\s+/, '');
    } else if (block.startsWith('## ')) {
      type = 'HEADING';
      headingData = { level: 2 };
      text = block.replace(/^##\s+/, '');
    } else if (block.startsWith('# ')) {
      type = 'HEADING';
      headingData = { level: 1 };
      text = block.replace(/^#\s+/, '');
    }

    // Strip raw HTML tags for clean text rendering in RichContent
    const cleanText = text.replace(/<[^>]+>/g, '');

    const node: any = {
      type,
      nodes: [
        {
          type: 'TEXT',
          textData: {
            text: cleanText,
          },
        },
      ],
    };

    if (headingData) {
      node.headingData = headingData;
    }

    return node;
  });

  return {
    nodes: nodes.length > 0 ? nodes : [{ type: 'PARAGRAPH', nodes: [{ type: 'TEXT', textData: { text: content } }] }],
  };
}

export class WixProvider implements CmsProvider {
  private apiKey: string;
  private siteId: string;
  private accountId?: string;
  private memberId?: string;
  private apiUrl: string;

  constructor(public baseUrl: string, credentials: any, config: any = {}) {
    this.apiKey = credentials?.apiKey || credentials?.accessToken || '';
    this.siteId = config?.siteId || credentials?.siteId || '';
    this.accountId = config?.accountId || credentials?.accountId;
    this.memberId = config?.memberId || credentials?.memberId;
    this.apiUrl = config?.apiUrl || 'https://www.wixapis.com';

    if (!this.apiKey) {
      throw new CmsProviderError('Missing Wix API Key or Access Token. Generate an API Key in Wix Account Settings > API Keys Manager.');
    }
    if (!this.siteId) {
      throw new CmsProviderError('Missing Wix Site ID. Find your Site ID in the URL of your Wix Dashboard: https://www.wix.com/dashboard/<SITE_ID>/home');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': this.apiKey.startsWith('Bearer ') ? this.apiKey : this.apiKey,
      'wix-site-id': this.siteId,
      'User-Agent': 'RankAutonomous-Cms-Connector/1.0',
    };

    if (this.accountId) {
      headers['wix-account-id'] = this.accountId;
    }

    return headers;
  }

  /**
   * Helper to parse and standardize Wix API errors safely without leaking secrets
   */
  private parseWixError(status: number, responseBody: string): string {
    let message = '';
    try {
      const parsed = JSON.parse(responseBody);
      message = parsed.message || parsed.details?.error || parsed.errorDescription || '';
    } catch {
      message = responseBody.substring(0, 150);
    }

    switch (status) {
      case 401:
        return 'Invalid Wix API Key or authentication token (HTTP 401).';
      case 403:
        return 'Missing required permission: "Manage Blog" (wix.blog.manage) on Wix Site ID (HTTP 403).';
      case 404:
        return 'Wix Site ID not found or Wix Blog app is not installed on this site (HTTP 404).';
      case 429:
        return 'Wix API rate limit exceeded. Please retry later (HTTP 429).';
      default:
        return `Wix API error (${status})${message ? `: ${message}` : ''}`;
    }
  }

  /**
   * Validates Wix connection and confirms 'Manage Blog' permissions on the Site ID
   */
  async testConnection(): Promise<boolean> {
    try {
      // Query draft posts with limit 1 to verify both read and manage access to Wix Blog API
      const res = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/draft-posts?paging.limit=1`, {
        method: 'GET',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      if (!res.ok) {
        // Fallback check to live posts in case draft-posts endpoint requires specific scope
        if (res.status === 404) {
          const fallbackRes = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/posts?paging.limit=1`, {
            method: 'GET',
            headers: this.getHeaders(),
            timeoutMs: 10000,
          });

          if (!fallbackRes.ok) {
            const errText = await fallbackRes.text().catch(() => '');
            throw new Error(this.parseWixError(fallbackRes.status, errText));
          }
          return true;
        }

        const errorText = await res.text().catch(() => '');
        throw new Error(this.parseWixError(res.status, errorText));
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Wix');
    }
  }

  /**
   * Publishes article to Wix Blog using official draft-first architecture:
   * 1. Check for existing post by slug to avoid duplicates.
   * 2. Create as Draft Post on Wix (`POST /blog/v3/draft-posts`).
   * 3. If live publishing requested, publish draft (`POST /blog/v3/draft-posts/{id}/publish`).
   * 4. If draft or future scheduled, retain as Draft on Wix.
   */
  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      // Duplicate prevention by slug check across live and draft posts
      if (payload.slug) {
        const checkRes = await ssrfSafeFetch(
          `${this.apiUrl}/blog/v3/posts?filter=${encodeURIComponent(JSON.stringify({ slug: payload.slug }))}`,
          {
            method: 'GET',
            headers: this.getHeaders(),
            timeoutMs: 10000,
          }
        ).catch(() => null);

        if (checkRes && checkRes.ok) {
          const checkData = await checkRes.json().catch(() => ({}));
          const existing = checkData?.posts?.[0];
          if (existing && existing.id) {
            return await this.updateArticle(existing.id, payload, false);
          }
        }

        // Also check draft posts
        const checkDraftRes = await ssrfSafeFetch(
          `${this.apiUrl}/blog/v3/draft-posts?filter=${encodeURIComponent(JSON.stringify({ slug: payload.slug }))}`,
          {
            method: 'GET',
            headers: this.getHeaders(),
            timeoutMs: 10000,
          }
        ).catch(() => null);

        if (checkDraftRes && checkDraftRes.ok) {
          const draftData = await checkDraftRes.json().catch(() => ({}));
          const existingDraft = draftData?.draftPosts?.[0];
          if (existingDraft && existingDraft.id) {
            return await this.updateArticle(existingDraft.id, payload, true);
          }
        }
      }

      // Step 1: Create as Draft Post on Wix
      const draftPostBody: any = {
        draftPost: {
          title: payload.title,
          excerpt: payload.excerpt || undefined,
          slug: payload.slug || undefined,
          memberId: this.memberId || undefined,
          richContent: buildWixRichContent(payload.content),
        },
      };

      const createRes = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/draft-posts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(draftPostBody),
        timeoutMs: 15000,
      });

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => '');
        return {
          status: 'FAILED',
          error: this.parseWixError(createRes.status, errText),
        };
      }

      const createData = await createRes.json().catch(() => ({}));
      const draftPost = createData?.draftPost || createData?.post || createData;
      const draftPostId = draftPost?.id;

      if (!draftPostId) {
        return {
          status: 'FAILED',
          error: 'Wix created draft post but returned no ID',
        };
      }

      // Step 2: If live publish is requested, publish the draft post
      if (payload.status === 'publish') {
        const publishRes = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/draft-posts/${draftPostId}/publish`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({}),
          timeoutMs: 15000,
        });

        if (!publishRes.ok) {
          const pubErrText = await publishRes.text().catch(() => '');
          return {
            status: 'FAILED',
            error: `Draft created on Wix (ID: ${draftPostId}), but publishing failed: ${this.parseWixError(publishRes.status, pubErrText)}`,
          };
        }

        const pubData = await publishRes.json().catch(() => ({}));
        const publishedPost = pubData?.post || pubData;
        const liveId = publishedPost?.id || draftPostId;
        const liveUrl = publishedPost?.url || (payload.slug && this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/post/${payload.slug}` : undefined);

        return {
          remoteId: String(liveId),
          remoteUrl: liveUrl,
          status: 'PUBLISHED',
        };
      }

      // Step 3: If draft or future scheduled:
      // Wix Blog REST API v3 does not support a native programmatic future scheduling parameter.
      // The article remains as a Draft post on Wix.
      const draftUrl = (payload.slug && this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/post/${payload.slug}` : undefined);

      return {
        remoteId: String(draftPostId),
        remoteUrl: draftUrl,
        status: payload.status === 'draft' ? 'PUBLISHED' : 'PUBLISHED', // Recorded as successfully created in target
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Wix publish failed' };
    }
  }

  /**
   * Updates existing Wix post or draft post
   */
  async updateArticle(remoteId: string, payload: CmsPublishPayload, isDraft: boolean = false): Promise<CmsPublishResult> {
    try {
      const richContent = buildWixRichContent(payload.content);

      if (isDraft) {
        // Update draft post
        const updateBody = {
          draftPost: {
            id: remoteId,
            title: payload.title,
            excerpt: payload.excerpt || undefined,
            slug: payload.slug || undefined,
            richContent,
          },
          fieldMask: {
            paths: ['title', 'excerpt', 'slug', 'richContent'],
          },
        };

        const patchRes = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/draft-posts/${remoteId}`, {
          method: 'PATCH',
          headers: this.getHeaders(),
          body: JSON.stringify(updateBody),
          timeoutMs: 15000,
        });

        if (!patchRes.ok) {
          const errText = await patchRes.text().catch(() => '');
          return { status: 'FAILED', error: this.parseWixError(patchRes.status, errText) };
        }

        // If target status is publish, publish the updated draft
        if (payload.status === 'publish') {
          const pubRes = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/draft-posts/${remoteId}/publish`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({}),
            timeoutMs: 15000,
          });

          if (!pubRes.ok) {
            const errText = await pubRes.text().catch(() => '');
            return { status: 'FAILED', error: this.parseWixError(pubRes.status, errText) };
          }

          const pubData = await pubRes.json().catch(() => ({}));
          const post = pubData?.post || pubData;
          return {
            remoteId: String(post?.id || remoteId),
            remoteUrl: post?.url || (payload.slug && this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/post/${payload.slug}` : undefined),
            status: 'PUBLISHED',
          };
        }

        return {
          remoteId,
          remoteUrl: payload.slug && this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/post/${payload.slug}` : undefined,
          status: 'PUBLISHED',
        };
      }

      // Update already-published live post
      const updateBody = {
        post: {
          id: remoteId,
          title: payload.title,
          excerpt: payload.excerpt || undefined,
          slug: payload.slug || undefined,
          richContent,
        },
        fieldMask: {
          paths: ['title', 'excerpt', 'slug', 'richContent'],
        },
      };

      const res = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/posts/${remoteId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(updateBody),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: this.parseWixError(res.status, errorText),
        };
      }

      const data = await res.json().catch(() => ({}));
      const remoteUrl = data?.post?.url || (payload.slug && this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/post/${payload.slug}` : undefined);

      return {
        remoteId,
        remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Wix update failed' };
    }
  }

  async deleteArticle(remoteId: string): Promise<boolean> {
    try {
      // Attempt delete on draft post first
      const draftRes = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/draft-posts/${remoteId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      if (draftRes.ok) return true;

      // Attempt delete on live post
      const liveRes = await ssrfSafeFetch(`${this.apiUrl}/blog/v3/posts/${remoteId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      return liveRes.ok;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to delete Wix post');
    }
  }
}
