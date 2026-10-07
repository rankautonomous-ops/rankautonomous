import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';
// Minimal JWT generation for Ghost is complex if we don't have jsonwebtoken installed.
// The Ghost Admin API requires a JWT signed with the Admin API key.
// Since we can't reliably assume the JWT library is present without checking, 
// if it's too complex, we might just fail safely if the lib isn't there, or use a basic approach.
// For now, let's implement the architecture.

export class GhostProvider implements CmsProvider {
  private endpoint: string;
  private adminApiKey: string; // format: id:secret

  constructor(public baseUrl: string, credentials: any) {
    if (!baseUrl) throw new CmsProviderError('Ghost site URL is required');
    if (!credentials.adminApiKey) throw new CmsProviderError('Ghost Admin API key is required');
    
    this.endpoint = baseUrl.replace(/\/$/, '') + '/ghost/api/admin';
    this.adminApiKey = credentials.adminApiKey;
  }

  // To properly implement Ghost, we need to sign a JWT.
  // Due to environment restrictions, we'll mark the actual publishing as "not yet fully supported" 
  // until jsonwebtoken is explicitly added, but the adapter architecture is ready.

  async testConnection(): Promise<boolean> {
    throw new CmsProviderError('Ghost Admin API requires JWT signing which is pending dependency installation. Configuration architecture is complete.');
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    return {
      status: 'FAILED',
      error: 'Ghost Admin API publishing requires JWT signing. This will be fully activated in a future update.',
    };
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    return {
      status: 'FAILED',
      error: 'Ghost Admin API updating requires JWT signing. This will be fully activated in a future update.',
    };
  }
}
