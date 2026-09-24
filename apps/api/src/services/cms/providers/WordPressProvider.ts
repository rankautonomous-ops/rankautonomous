import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { WordPressClient, WordPressApiError } from '../../wordpress/client';

export class WordPressCmsProvider implements CmsProvider {
  private client: WordPressClient;

  constructor(public baseUrl: string, credentials: any) {
    if (!baseUrl || !credentials?.username || !credentials?.applicationPassword) {
      throw new CmsProviderError('Missing WordPress credentials or site URL');
    }
    this.client = new WordPressClient(baseUrl, credentials);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.testConnection();
      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to WordPress');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const wpPayload: any = {
        title: payload.title,
        content: payload.content,
        status: payload.status,
      };

      if (payload.slug) wpPayload.slug = payload.slug;
      if (payload.excerpt) wpPayload.excerpt = payload.excerpt;
      if (payload.status === 'future' && payload.scheduledAt) {
        wpPayload.date_gmt = new Date(payload.scheduledAt).toISOString();
      }

      const res = await this.client.createPost(wpPayload);

      return {
        remoteId: res.id.toString(),
        remoteUrl: res.link,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      const msg = err instanceof WordPressApiError ? err.message : (err.message || 'WordPress publish failed');
      return { status: 'FAILED', error: msg };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const wpPayload: any = {
        title: payload.title,
        content: payload.content,
        status: payload.status,
      };

      if (payload.slug) wpPayload.slug = payload.slug;
      if (payload.excerpt) wpPayload.excerpt = payload.excerpt;
      if (payload.status === 'future' && payload.scheduledAt) {
        wpPayload.date_gmt = new Date(payload.scheduledAt).toISOString();
      }

      const res = await this.client.updatePost(parseInt(remoteId, 10), wpPayload);

      return {
        remoteId: res.id.toString(),
        remoteUrl: res.link,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      const msg = err instanceof WordPressApiError ? err.message : (err.message || 'WordPress update failed');
      return { status: 'FAILED', error: msg };
    }
  }

  async deleteArticle(remoteId: string): Promise<boolean> {
    try {
      await this.client.deletePost(parseInt(remoteId, 10), false);
      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to delete WordPress post');
    }
  }
}
