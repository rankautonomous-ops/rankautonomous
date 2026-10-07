import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';

export class NotionProvider implements CmsProvider {
  private integrationToken: string;
  private databaseId: string;

  constructor(credentials: any, config: any) {
    if (!credentials.integrationToken) throw new CmsProviderError('Notion integration token is required');
    if (!config.databaseId) throw new CmsProviderError('Notion destination Database ID is required');

    this.integrationToken = credentials.integrationToken;
    this.databaseId = config.databaseId;
  }

  async testConnection(): Promise<boolean> {
    throw new CmsProviderError('Notion integration requires advanced markdown-to-block parsing which is coming soon. Configuration architecture is complete.');
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    return {
      status: 'FAILED',
      error: 'Notion publishing requires block parsing. This will be fully activated in a future update.',
    };
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    return {
      status: 'FAILED',
      error: 'Notion updating requires block parsing. This will be fully activated in a future update.',
    };
  }
}
