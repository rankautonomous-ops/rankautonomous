import { CmsProvider, CmsPublishPayload, CmsPublishResult } from '../types';

export class RssProvider implements CmsProvider {
  constructor(config: any) {}

  async testConnection(): Promise<boolean> {
    // RSS doesn't have an external connection to test.
    // It's hosted by us.
    return true;
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    // For RSS, publishing simply means it's marked as PUBLISHED in our database.
    // Our RSS feed endpoint will serve any article marked as PUBLISHED for this connection.
    return {
      status: 'PUBLISHED',
      remoteId: `rss-${Date.now()}`,
    };
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    return {
      status: 'PUBLISHED',
      remoteId,
    };
  }
}
