import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';

export class HubSpotProvider implements CmsProvider {
  private accessToken: string;
  private contentGroupId?: string;
  private apiUrl: string = 'https://api.hubapi.com/cms/v3/blogs/posts';

  constructor(public baseUrl: string, credentials: any, config: any = {}) {
    this.accessToken = credentials?.accessToken || credentials?.token || '';
    this.contentGroupId = config?.contentGroupId || credentials?.contentGroupId;

    if (!this.accessToken) {
      throw new CmsProviderError('Missing HubSpot Private App Access Token');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'User-Agent': 'RankAutonomous-Cms-Connector/1.0',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`${this.apiUrl}?limit=1`, {
        method: 'GET',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HubSpot API error (${res.status}): ${errorText.substring(0, 150) || res.statusText}`);
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to HubSpot');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      // Duplicate prevention: check if slug exists
      if (payload.slug) {
        const checkRes = await ssrfSafeFetch(`${this.apiUrl}?slug=${encodeURIComponent(payload.slug)}`, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: 10000,
        }).catch(() => null);

        if (checkRes && checkRes.ok) {
          const checkData = await checkRes.json().catch(() => ({}));
          const existing = checkData?.results?.[0];
          if (existing && existing.id) {
            return await this.updateArticle(String(existing.id), payload);
          }
        }
      }

      const isPublished = payload.status === 'publish';
      const hsPayload: any = {
        name: payload.title,
        postBody: payload.content,
        postSummary: payload.excerpt || undefined,
        slug: payload.slug || undefined,
        currentState: isPublished ? 'PUBLISHED' : 'DRAFT',
      };

      if (this.contentGroupId) {
        hsPayload.contentGroupId = this.contentGroupId;
      }

      if (payload.status === 'future' && payload.scheduledAt) {
        hsPayload.publishDate = new Date(payload.scheduledAt).toISOString();
        hsPayload.currentState = 'SCHEDULED';
      }

      const res = await ssrfSafeFetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(hsPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `HubSpot publish failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.id ? String(data.id) : undefined,
        remoteUrl: data.url || undefined,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'HubSpot publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const isPublished = payload.status === 'publish';
      const hsPayload: any = {
        name: payload.title,
        postBody: payload.content,
        postSummary: payload.excerpt || undefined,
        slug: payload.slug || undefined,
        currentState: isPublished ? 'PUBLISHED' : 'DRAFT',
      };

      const res = await ssrfSafeFetch(`${this.apiUrl}/${remoteId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(hsPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `HubSpot update failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.id ? String(data.id) : remoteId,
        remoteUrl: data.url || undefined,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'HubSpot update failed' };
    }
  }

  async deleteArticle(remoteId: string): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`${this.apiUrl}/${remoteId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      return res.ok;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to delete HubSpot post');
    }
  }
}
