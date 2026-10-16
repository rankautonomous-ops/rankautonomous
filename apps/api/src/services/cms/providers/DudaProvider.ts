import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';

export class DudaProvider implements CmsProvider {
  private siteName: string;
  private authHeader: string;
  private apiHost: string;

  constructor(public baseUrl: string, credentials: any, config: any = {}) {
    const username = credentials?.username || '';
    const password = credentials?.password || '';
    this.siteName = config?.siteName || credentials?.siteName || '';
    this.apiHost = config?.apiHost || 'https://api.duda.co';

    if (!username || !password) {
      throw new CmsProviderError('Missing Duda API Username or Password');
    }
    if (!this.siteName) {
      throw new CmsProviderError('Missing Duda Site Name / Alias');
    }

    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  private get endpoint(): string {
    return `${this.apiHost}/api/sites/multiscreen/blog/${this.siteName}/posts`;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': this.authHeader,
      'User-Agent': 'RankAutonomous-Cms-Connector/1.0',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`${this.endpoint}?limit=1`, {
        method: 'GET',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Duda API error (${res.status}): ${errorText.substring(0, 150) || res.statusText}`);
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Duda');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      // Duplicate prevention: check if slug exists
      if (payload.slug) {
        const checkRes = await ssrfSafeFetch(`${this.endpoint}?post_url=${encodeURIComponent(payload.slug)}`, {
          method: 'GET',
          headers: this.getHeaders(),
          timeoutMs: 10000,
        }).catch(() => null);

        if (checkRes && checkRes.ok) {
          const list = await checkRes.json().catch(() => []);
          if (Array.isArray(list) && list.length > 0 && list[0].id) {
            return await this.updateArticle(String(list[0].id), payload);
          }
        }
      }

      const isPublished = payload.status === 'publish';
      const dudaPayload: any = {
        title: payload.title,
        content: payload.content,
        post_url: payload.slug || undefined,
        description: payload.excerpt || undefined,
        status: isPublished ? 'PUBLISHED' : 'DRAFT',
      };

      if (payload.status === 'future' && payload.scheduledAt) {
        dudaPayload.publish_date = new Date(payload.scheduledAt).toISOString();
        dudaPayload.status = 'SCHEDULED';
      }

      const res = await ssrfSafeFetch(this.endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(dudaPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `Duda publish failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      const remoteId = data.id ? String(data.id) : undefined;
      const remoteUrl = data.post_url || (payload.slug && this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/blog/${payload.slug}` : undefined);

      return {
        remoteId,
        remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Duda publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const isPublished = payload.status === 'publish';
      const dudaPayload: any = {
        title: payload.title,
        content: payload.content,
        post_url: payload.slug || undefined,
        description: payload.excerpt || undefined,
        status: isPublished ? 'PUBLISHED' : 'DRAFT',
      };

      const res = await ssrfSafeFetch(`${this.endpoint}/${remoteId}`, {
        method: 'POST', // Duda uses POST or PUT to the post id endpoint
        headers: this.getHeaders(),
        body: JSON.stringify(dudaPayload),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `Duda update failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      const remoteUrl = data.post_url || (payload.slug && this.baseUrl ? `${this.baseUrl.replace(/\/$/, '')}/blog/${payload.slug}` : undefined);

      return {
        remoteId,
        remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Duda update failed' };
    }
  }

  async deleteArticle(remoteId: string): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`${this.endpoint}/${remoteId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      return res.ok;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to delete Duda post');
    }
  }
}
