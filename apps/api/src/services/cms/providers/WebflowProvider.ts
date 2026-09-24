import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';

export class WebflowCmsProvider implements CmsProvider {
  private accessToken: string;
  private siteId: string;
  private collectionId: string;
  private fieldMapping: any;

  constructor(credentials: any, config: any) {
    if (!credentials?.accessToken) {
      throw new CmsProviderError('Missing Webflow access token');
    }
    this.accessToken = credentials.accessToken;
    this.siteId = config.siteId;
    this.collectionId = config.collectionId;
    this.fieldMapping = config.fieldMapping || {
      name: 'name',
      slug: 'slug',
      content: 'post-body',
      excerpt: 'post-summary'
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch('https://api.webflow.com/v2/sites', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept-Version': '2.0.0',
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        throw new Error(`Webflow API error: ${res.statusText}`);
      }
      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Webflow');
    }
  }

  private mapFields(payload: CmsPublishPayload) {
    const fields: any = {};
    if (this.fieldMapping.name) fields[this.fieldMapping.name] = payload.title;
    if (this.fieldMapping.slug && payload.slug) fields[this.fieldMapping.slug] = payload.slug;
    if (this.fieldMapping.content) fields[this.fieldMapping.content] = payload.content;
    if (this.fieldMapping.excerpt && payload.excerpt) fields[this.fieldMapping.excerpt] = payload.excerpt;
    
    // Webflow requires isArchived and isDraft for v2 items
    fields._archived = false;
    fields._draft = payload.status !== 'publish';
    
    return fields;
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    if (!this.collectionId) {
      return { status: 'FAILED', error: 'Webflow collectionId not configured.' };
    }

    try {
      const fields = this.mapFields(payload);

      const res = await fetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fieldData: fields, isArchived: false, isDraft: payload.status !== 'publish' })
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { status: 'FAILED', error: `Webflow publish failed: ${errorText.substring(0, 200)}` };
      }

      const data = await res.json();
      return {
        remoteId: data.id,
        // Webflow API v2 doesn't return the live URL directly in the item response typically, we just omit or derive if domain is known
        remoteUrl: '', 
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Webflow publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    if (!this.collectionId) {
      return { status: 'FAILED', error: 'Webflow collectionId not configured.' };
    }

    try {
      const fields = this.mapFields(payload);

      const res = await fetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items/${remoteId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fieldData: fields, isArchived: false, isDraft: payload.status !== 'publish' })
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { status: 'FAILED', error: `Webflow update failed: ${errorText.substring(0, 200)}` };
      }

      const data = await res.json();
      return {
        remoteId: data.id,
        remoteUrl: '',
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Webflow update failed' };
    }
  }
}
