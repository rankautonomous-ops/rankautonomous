import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';

export class ComingSoonProvider implements CmsProvider {
  constructor(public providerName: string) {}

  async testConnection(): Promise<boolean> {
    throw new CmsProviderError(`Connection to ${this.providerName} is coming soon and not yet fully supported.`);
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    return {
      status: 'FAILED',
      error: `Publishing to ${this.providerName} is coming soon and not yet supported.`,
    };
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    return {
      status: 'FAILED',
      error: `Updating on ${this.providerName} is coming soon and not yet supported.`,
    };
  }
}
