import { ssrfSafeFetch } from '../../lib/urlSafety';
import {
  WordPressCredentials,
  WordPressPostPayload,
  WordPressPostResponse,
  WordPressUserResponse,
} from './types';

export class WordPressApiError extends Error {
  statusCode: number;
  wpCode?: string;

  constructor(message: string, statusCode = 500, wpCode?: string) {
    super(message);
    this.name = 'WordPressApiError';
    this.statusCode = statusCode;
    this.wpCode = wpCode;
  }
}

export function normalizeWordPressUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new WordPressApiError('Invalid WordPress site URL provided.', 400);
  }

  let cleaned = rawUrl.trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }

  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');

  // If user provided /wp-json/wp/v2 or /wp-json at the end, strip it
  cleaned = cleaned.replace(/\/wp-json(\/wp\/v2)?\/?$/, '');

  try {
    const parsed = new URL(cleaned);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch (err: any) {
    throw new WordPressApiError(`Malformed WordPress site URL: ${err.message}`, 400);
  }
}

export class WordPressClient {
  readonly siteUrl: string;
  readonly username: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(siteUrl: string, credentials: WordPressCredentials, timeoutMs = 15000) {
    this.siteUrl = normalizeWordPressUrl(siteUrl);
    this.username = credentials.username?.trim();
    const appPassword = credentials.applicationPassword?.trim();

    if (!this.username || !appPassword) {
      throw new WordPressApiError('WordPress username and application password are required.', 400);
    }

    // WordPress Application Passwords may contain spaces (e.g., "xxxx xxxx xxxx xxxx")
    // Basic Auth header expects base64(username:password_without_spaces_or_with_spaces)
    this.authHeader = `Basic ${Buffer.from(`${this.username}:${appPassword}`).toString('base64')}`;
    this.timeoutMs = timeoutMs;
  }

  private getRestUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.siteUrl}/wp-json/wp/v2${cleanPath}`;
  }

  private async executeRequest<T>(
    path: string,
    options: { method?: string; body?: any; query?: Record<string, string> } = {}
  ): Promise<T> {
    let url = this.getRestUrl(path);
    if (options.query && Object.keys(options.query).length > 0) {
      const searchParams = new URLSearchParams(options.query);
      url += (url.includes('?') ? '&' : '?') + searchParams.toString();
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };

    let bodyStr: string | undefined;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await ssrfSafeFetch(url, {
        method: options.method || 'GET',
        headers,
        body: bodyStr,
        timeoutMs: this.timeoutMs,
      });
    } catch (netErr: any) {
      if (netErr.message?.includes('timeout')) {
        throw new WordPressApiError(
          `Connection timed out while communicating with WordPress (${this.siteUrl}).`,
          504
        );
      }
      if (netErr.message?.includes('SSRF')) {
        throw new WordPressApiError(
          `Security violation: WordPress site resolves to a private or disallowed IP address.`,
          400
        );
      }
      throw new WordPressApiError(
        `Failed to connect to WordPress site at ${this.siteUrl}: ${netErr.message}`,
        502
      );
    }

    const status = response.status;
    let data: any = null;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (jsonErr) {
        data = null;
      }
    } else {
      const text = await response.text();
      data = { message: text.substring(0, 300) };
    }

    if (!response.ok) {
      const wpMsg = data?.message || '';
      const wpCode = data?.code || '';

      if (status === 401) {
        throw new WordPressApiError(
          `WordPress Authentication Failed: Invalid username or application password. ${wpMsg}`.trim(),
          401,
          wpCode
        );
      }
      if (status === 403) {
        throw new WordPressApiError(
          `WordPress Permission Denied: User "${this.username}" does not have sufficient permissions to perform this action. ${wpMsg}`.trim(),
          403,
          wpCode
        );
      }
      if (status === 404) {
        throw new WordPressApiError(
          `WordPress REST API endpoint not found at ${url}. Ensure WordPress permalinks are configured (not "Plain") and the REST API is enabled.`,
          404,
          wpCode
        );
      }
      if (status === 429) {
        throw new WordPressApiError(
          `WordPress rate limit exceeded. Please wait a moment before retrying.`,
          429,
          wpCode
        );
      }

      throw new WordPressApiError(
        wpMsg || `WordPress REST API responded with status ${status}.`,
        status >= 500 ? 502 : status,
        wpCode
      );
    }

    return data as T;
  }

  /**
   * Tests connection by retrieving the current user's profile and checking capabilities.
   */
  async testConnection(): Promise<{
    success: boolean;
    user: WordPressUserResponse;
    canPublish: boolean;
  }> {
    const user = await this.executeRequest<WordPressUserResponse>('/users/me', {
      method: 'GET',
      query: { context: 'edit' },
    });

    // Check capability: publish_posts or role editor/administrator/author
    const capabilities = user.capabilities || {};
    const roles = user.roles || [];
    const canPublish =
      Boolean(capabilities.publish_posts) ||
      Boolean(capabilities.edit_posts) ||
      roles.includes('administrator') ||
      roles.includes('editor') ||
      roles.includes('author');

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        slug: user.slug,
        capabilities,
        roles,
      },
      canPublish,
    };
  }

  /**
   * Creates a new post in WordPress.
   */
  async createPost(payload: WordPressPostPayload): Promise<WordPressPostResponse> {
    return this.executeRequest<WordPressPostResponse>('/posts', {
      method: 'POST',
      body: payload,
    });
  }

  /**
   * Updates an existing post in WordPress.
   */
  async updatePost(
    postId: number,
    payload: Partial<WordPressPostPayload>
  ): Promise<WordPressPostResponse> {
    return this.executeRequest<WordPressPostResponse>(`/posts/${postId}`, {
      method: 'POST',
      body: payload,
    });
  }

  /**
   * Retrieves a post by ID from WordPress.
   */
  async getPost(postId: number): Promise<WordPressPostResponse> {
    return this.executeRequest<WordPressPostResponse>(`/posts/${postId}`, {
      method: 'GET',
      query: { context: 'edit' },
    });
  }

  /**
   * Trashes or permanently deletes a post in WordPress.
   */
  async deletePost(postId: number, force = false): Promise<WordPressPostResponse> {
    return this.executeRequest<WordPressPostResponse>(`/posts/${postId}`, {
      method: 'DELETE',
      query: force ? { force: 'true' } : {},
    });
  }
}
