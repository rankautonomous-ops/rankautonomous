import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';

export class CustomCmsProvider implements CmsProvider {
  private endpoint: string;
  private authMethod: 'NONE' | 'BEARER' | 'API_KEY';
  private authToken: string;
  private headerName: string;

  constructor(public baseUrl: string, credentials: any, config: any) {
    if (!baseUrl) {
      throw new CmsProviderError('Missing Custom CMS endpoint');
    }
    this.endpoint = baseUrl;
    this.authMethod = config.authMethod || 'NONE';
    this.authToken = credentials.token || '';
    this.headerName = config.headerName || 'Authorization';
  }

  private getHeaders() {
    const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent': 'RankAutonomous-Cms-Connector/1.0',
    };

    if (this.authMethod === 'BEARER' && this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    } else if (this.authMethod === 'API_KEY' && this.authToken && this.headerName) {
      headers[this.headerName] = this.authToken;
    }

    return headers;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(this.endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ action: 'ping' }),
        timeoutMs: 10000,
        maxRedirects: 2
      });

      if (!res.ok) {
        throw new Error(`Endpoint returned status ${res.status}`);
      }
      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Custom CMS endpoint');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const customPayload = {
        action: 'publish',
        article: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          tags: payload.tags,
          scheduledAt: payload.scheduledAt
        }
      };

      const res = await ssrfSafeFetch(this.endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(customPayload),
        timeoutMs: 15000,
        maxRedirects: 2
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { status: 'FAILED', error: `Custom endpoint publish failed: ${res.status} ${errorText.substring(0, 200)}` };
      }

      const data = await res.json().catch(() => ({}));
      
      return {
        remoteId: data.remoteId ? String(data.remoteId) : undefined,
        remoteUrl: data.remoteUrl || undefined,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Custom endpoint publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const customPayload = {
        action: 'update',
        remoteId,
        article: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          tags: payload.tags,
          scheduledAt: payload.scheduledAt
        }
      };

      const res = await ssrfSafeFetch(this.endpoint, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(customPayload),
        timeoutMs: 15000,
        maxRedirects: 2
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { status: 'FAILED', error: `Custom endpoint update failed: ${res.status} ${errorText.substring(0, 200)}` };
      }

      const data = await res.json().catch(() => ({}));
      
      return {
        remoteId: data.remoteId ? String(data.remoteId) : remoteId,
        remoteUrl: data.remoteUrl || undefined,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Custom endpoint update failed' };
    }
  }
}
