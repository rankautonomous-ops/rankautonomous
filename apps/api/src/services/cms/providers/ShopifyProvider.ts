import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';

export class ShopifyCmsProvider implements CmsProvider {
  private apiVersion: string;
  private shopName: string;
  private accessToken: string;
  private blogId: string;

  constructor(public baseUrl: string, credentials: any, config: any) {
    if (!baseUrl || !credentials?.accessToken) {
      throw new CmsProviderError('Missing Shopify access token or store URL');
    }
    // Clean shop name. e.g. "my-store.myshopify.com"
    this.shopName = baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    this.accessToken = credentials.accessToken;
    this.blogId = config?.blogId; // The destination blog ID
    this.apiVersion = config?.apiVersion || '2024-07'; // Configurable API version
  }

  private get apiUrl() {
    return `https://${this.shopName}/admin/api/${this.apiVersion}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        }
      });
      if (!res.ok) {
        throw new Error(`Shopify API error: ${res.statusText}`);
      }
      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Shopify');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    if (!this.blogId) {
      return { status: 'FAILED', error: 'Shopify blogId not configured.' };
    }
    
    try {
      const shopifyPayload = {
        article: {
          title: payload.title,
          body_html: payload.content,
          handle: payload.slug,
          summary_html: payload.excerpt,
          published: payload.status === 'publish',
          tags: payload.tags ? payload.tags.join(', ') : undefined,
        }
      };

      const res = await fetch(`${this.apiUrl}/blogs/${this.blogId}/articles.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shopifyPayload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { status: 'FAILED', error: `Shopify publish failed: ${errorText.substring(0, 200)}` };
      }

      const data = await res.json();
      return {
        remoteId: data.article.id.toString(),
        remoteUrl: `https://${this.shopName}/blogs/${this.blogId}/${data.article.handle}`,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Shopify publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    if (!this.blogId) {
      return { status: 'FAILED', error: 'Shopify blogId not configured.' };
    }

    try {
      const shopifyPayload = {
        article: {
          id: parseInt(remoteId, 10),
          title: payload.title,
          body_html: payload.content,
          handle: payload.slug,
          summary_html: payload.excerpt,
          published: payload.status === 'publish',
          tags: payload.tags ? payload.tags.join(', ') : undefined,
        }
      };

      const res = await fetch(`${this.apiUrl}/blogs/${this.blogId}/articles/${remoteId}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shopifyPayload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { status: 'FAILED', error: `Shopify update failed: ${errorText.substring(0, 200)}` };
      }

      const data = await res.json();
      return {
        remoteId: data.article.id.toString(),
        remoteUrl: `https://${this.shopName}/blogs/${this.blogId}/${data.article.handle}`,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Shopify update failed' };
    }
  }
}
