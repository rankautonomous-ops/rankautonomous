import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';
import jwt from 'jsonwebtoken';

export class GhostProvider implements CmsProvider {
  private endpoint: string;
  private adminApiKey: string; // format: id:secret

  constructor(public baseUrl: string, credentials: any) {
    if (!baseUrl) throw new CmsProviderError('Ghost site URL is required');
    if (!credentials?.adminApiKey) throw new CmsProviderError('Ghost Admin API key is required');
    
    this.endpoint = baseUrl.replace(/\/$/, '') + '/ghost/api/admin';
    this.adminApiKey = credentials.adminApiKey;
  }

  private generateToken(): string {
    const parts = this.adminApiKey.split(':');
    if (parts.length !== 2) throw new CmsProviderError('Invalid Ghost Admin API key format. Expected id:secret');
    const [id, secret] = parts;

    return jwt.sign({}, Buffer.from(secret, 'hex'), {
      keyid: id,
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: '/admin/'
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`${this.endpoint}/site/`, {
        method: 'GET',
        headers: {
          'Authorization': `Ghost ${this.generateToken()}`,
          'Accept-Version': 'v5.0'
        }
      });
      if (!res.ok) {
        throw new Error(`Ghost API returned ${res.status}`);
      }
      return true;
    } catch (e: any) {
      throw new CmsProviderError(`Failed to connect to Ghost: ${e.message}`);
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      // Check for duplicate by slug
      if (payload.slug) {
        const search = await ssrfSafeFetch(`${this.endpoint}/posts/?filter=slug:${payload.slug}`, {
          method: 'GET',
          headers: {
            'Authorization': `Ghost ${this.generateToken()}`,
            'Accept-Version': 'v5.0'
          }
        });
        if (search.ok) {
          const searchData = await search.json();
          if (searchData.posts && searchData.posts.length > 0) {
            return await this.updateArticle(searchData.posts[0].id, payload);
          }
        }
      }

      // Convert Markdown to Mobiledoc or HTML
      // Ghost accepts HTML source to convert to its internal mobiledoc format natively
      const ghostPayload = {
        posts: [{
          title: payload.title,
          slug: payload.slug,
          html: payload.content,
          custom_excerpt: payload.excerpt,
          status: payload.status === 'publish' ? 'published' : 'draft',
          published_at: payload.scheduledAt ? new Date(payload.scheduledAt).toISOString() : undefined
        }]
      };

      const res = await ssrfSafeFetch(`${this.endpoint}/posts/?source=html`, {
        method: 'POST',
        headers: {
          'Authorization': `Ghost ${this.generateToken()}`,
          'Accept-Version': 'v5.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ghostPayload)
      });

      if (!res.ok) {
        const errText = await res.text();
        return { status: 'FAILED', error: `Ghost API Error: ${errText.substring(0, 200)}` };
      }

      const data = await res.json();
      const post = data.posts[0];
      return {
        status: 'PUBLISHED',
        remoteId: post.id,
        remoteUrl: post.url
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Ghost publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      // Need updated_at for Ghost update
      const getRes = await ssrfSafeFetch(`${this.endpoint}/posts/${remoteId}/`, {
        method: 'GET',
        headers: {
          'Authorization': `Ghost ${this.generateToken()}`,
          'Accept-Version': 'v5.0'
        }
      });
      let updatedAt = '';
      if (getRes.ok) {
         const getData = await getRes.json();
         updatedAt = getData.posts[0].updated_at;
      } else {
         return { status: 'FAILED', error: `Ghost API Error: Failed to fetch post to update` };
      }

      const ghostPayload = {
        posts: [{
          title: payload.title,
          slug: payload.slug,
          html: payload.content,
          custom_excerpt: payload.excerpt,
          status: payload.status === 'publish' ? 'published' : 'draft',
          published_at: payload.scheduledAt ? new Date(payload.scheduledAt).toISOString() : undefined,
          updated_at: updatedAt
        }]
      };

      const res = await ssrfSafeFetch(`${this.endpoint}/posts/${remoteId}/?source=html`, {
        method: 'PUT',
        headers: {
          'Authorization': `Ghost ${this.generateToken()}`,
          'Accept-Version': 'v5.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ghostPayload)
      });

      if (!res.ok) {
        const errText = await res.text();
        return { status: 'FAILED', error: `Ghost API Error: ${errText.substring(0, 200)}` };
      }

      const data = await res.json();
      const post = data.posts[0];
      return {
        status: 'PUBLISHED',
        remoteId: post.id,
        remoteUrl: post.url
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Ghost update failed' };
    }
  }
}

