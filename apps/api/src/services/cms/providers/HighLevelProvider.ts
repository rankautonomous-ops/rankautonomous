import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';

export class HighLevelProvider implements CmsProvider {
  private accessToken: string;
  private locationId: string;
  private blogId: string;
  private apiUrl: string = 'https://services.leadconnectorhq.com/blogs/posts';

  constructor(public baseUrl: string, credentials: any, config: any = {}) {
    this.accessToken = credentials?.accessToken || credentials?.apiKey || credentials?.token || '';
    this.locationId = config?.locationId || credentials?.locationId || '';
    this.blogId = config?.blogId || credentials?.blogId || '';

    if (!this.accessToken) {
      throw new CmsProviderError('Missing HighLevel API Key / Access Token');
    }
    if (!this.locationId) {
      throw new CmsProviderError('Missing HighLevel Location ID');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'Version': '2021-07-28',
      'User-Agent': 'RankAutonomous-Cms-Connector/1.0',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`${this.apiUrl}?locationId=${encodeURIComponent(this.locationId)}&limit=1`, {
        method: 'GET',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HighLevel API error (${res.status}): ${errorText.substring(0, 150) || res.statusText}`);
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to HighLevel');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      // Duplicate check: search existing posts
      if (payload.slug) {
        const checkRes = await ssrfSafeFetch(
          `${this.apiUrl}?locationId=${encodeURIComponent(this.locationId)}&searchTerm=${encodeURIComponent(payload.slug)}`,
          {
            method: 'GET',
            headers: this.getHeaders(),
            timeoutMs: 10000,
          }
        ).catch(() => null);

        if (checkRes && checkRes.ok) {
          const checkData = await checkRes.json().catch(() => ({}));
          const list = checkData?.posts || checkData?.data || [];
          const existing = list.find((p: any) => p.slug === payload.slug || p.url === payload.slug);
          if (existing && (existing._id || existing.id)) {
            return await this.updateArticle(String(existing._id || existing.id), payload);
          }
        }
      }

      const isPublished = payload.status === 'publish';
      const ghlPayload: any = {
        locationId: this.locationId,
        title: payload.title,
        description: payload.excerpt || undefined,
        rawHtml: payload.content,
        slug: payload.slug || undefined,
        status: isPublished ? 'PUBLISHED' : 'DRAFT',
      };

      if (this.blogId) {
        ghlPayload.blogId = this.blogId;
      }

      if (payload.tags && payload.tags.length > 0) {
        ghlPayload.tags = payload.tags;
      }

      const res = await ssrfSafeFetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(ghlPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `HighLevel publish failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      const remoteId = data._id || data.id || data.post?._id || data.post?.id;
      const remoteUrl = data.url || data.post?.url || undefined;

      return {
        remoteId: remoteId ? String(remoteId) : undefined,
        remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'HighLevel publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const isPublished = payload.status === 'publish';
      const ghlPayload: any = {
        locationId: this.locationId,
        title: payload.title,
        description: payload.excerpt || undefined,
        rawHtml: payload.content,
        slug: payload.slug || undefined,
        status: isPublished ? 'PUBLISHED' : 'DRAFT',
      };

      if (this.blogId) {
        ghlPayload.blogId = this.blogId;
      }

      const res = await ssrfSafeFetch(`${this.apiUrl}/${remoteId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(ghlPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `HighLevel update failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      const remoteUrl = data.url || data.post?.url || undefined;

      return {
        remoteId,
        remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'HighLevel update failed' };
    }
  }

  async deleteArticle(remoteId: string): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`${this.apiUrl}/${remoteId}?locationId=${encodeURIComponent(this.locationId)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      return res.ok;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to delete HighLevel post');
    }
  }
}
