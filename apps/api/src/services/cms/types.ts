export interface CmsPublishPayload {
  title: string;
  content: string;
  slug?: string;
  excerpt?: string;
  status: 'publish' | 'draft' | 'future';
  scheduledAt?: string;
  tags?: string[];
}

export interface CmsPublishResult {
  remoteId?: string;
  remoteUrl?: string;
  status: 'PUBLISHED' | 'FAILED';
  error?: string;
}

export interface CmsProvider {
  testConnection(): Promise<boolean>;
  publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult>;
  updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult>;
  deleteArticle?(remoteId: string): Promise<boolean>;
}

export class CmsProviderError extends Error {
  constructor(public message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'CmsProviderError';
  }
}
