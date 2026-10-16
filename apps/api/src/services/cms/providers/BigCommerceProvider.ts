import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';

export class BigCommerceProvider implements CmsProvider {
  private storeHash: string;
  private accessToken: string;
  private clientId: string;

  constructor(public baseUrl: string, credentials: any, config: any = {}) {
    this.accessToken = credentials?.accessToken || credentials?.token || '';
    this.clientId = credentials?.clientId || config?.clientId || '';
    
    // Store hash can come from config, credentials, or extracted from baseUrl
    let hash = config?.storeHash || credentials?.storeHash || '';
    if (!hash && baseUrl) {
      const match = baseUrl.match(/stores\/([a-zA-Z0-9]+)/);
      if (match) hash = match[1];
    }
    this.storeHash = hash;

    if (!this.accessToken) {
      throw new CmsProviderError('Missing BigCommerce API Access Token');
    }
    if (!this.storeHash) {
      throw new CmsProviderError('Missing BigCommerce Store Hash');
    }
  }

  private get apiUrl(): string {
    return `https://api.bigcommerce.com/stores/${this.storeHash}/v2/blog/posts`;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Auth-Token': this.accessToken,
      'User-Agent': 'RankAutonomous-Cms-Connector/1.0',
    };
    if (this.clientId) {
      headers['X-Auth-Client'] = this.clientId;
    }
    return headers;
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
        throw new Error(`BigCommerce API error (${res.status}): ${errorText.substring(0, 150) || res.statusText}`);
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to BigCommerce');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const cleanSlug = payload.slug ? (payload.slug.startsWith('/') ? payload.slug : `/${payload.slug}`) : undefined;

      // Duplicate prevention: check if a post with this URL exists
      if (cleanSlug) {
        const searchRes = await ssrfSafeFetch(`${this.apiUrl}?url=${encodeURIComponent(cleanSlug)}`, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: 10000,
        }).catch(() => null);

        if (searchRes && searchRes.ok) {
          const searchData = await searchRes.json().catch(() => []);
          if (Array.isArray(searchData) && searchData.length > 0 && searchData[0].id) {
            return await this.updateArticle(String(searchData[0].id), payload);
          }
        }
      }

      const isPublished = payload.status === 'publish';
      const bcPayload: any = {
        title: payload.title,
        body: payload.content,
        is_published: isPublished,
        summary: payload.excerpt || undefined,
      };

      if (cleanSlug) bcPayload.url = cleanSlug;
      if (payload.tags && payload.tags.length > 0) {
        bcPayload.tags = payload.tags;
      }
      if (payload.status === 'future' && payload.scheduledAt) {
        bcPayload.published_date = new Date(payload.scheduledAt).toUTCString();
        bcPayload.is_published = false;
      }

      const res = await ssrfSafeFetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(bcPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `BigCommerce publish failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.id ? String(data.id) : undefined,
        remoteUrl: data.preview_url || data.url || undefined,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'BigCommerce publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const cleanSlug = payload.slug ? (payload.slug.startsWith('/') ? payload.slug : `/${payload.slug}`) : undefined;
      const isPublished = payload.status === 'publish';

      const bcPayload: any = {
        title: payload.title,
        body: payload.content,
        is_published: isPublished,
        summary: payload.excerpt || undefined,
      };

      if (cleanSlug) bcPayload.url = cleanSlug;
      if (payload.tags && payload.tags.length > 0) {
        bcPayload.tags = payload.tags;
      }

      const res = await ssrfSafeFetch(`${this.apiUrl}/${remoteId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(bcPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `BigCommerce update failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.id ? String(data.id) : remoteId,
        remoteUrl: data.preview_url || data.url || undefined,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'BigCommerce update failed' };
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
      throw new CmsProviderError(err.message || 'Failed to delete BigCommerce post');
    }
  }
}
