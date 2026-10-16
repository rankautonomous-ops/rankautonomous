import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';

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

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept-Version': '2.0.0',
      'Content-Type': 'application/json',
      'User-Agent': 'RankAutonomous-Cms-Connector/1.0',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch('https://api.webflow.com/v2/sites', {
        headers: this.getHeaders(),
        timeoutMs: 10000,
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
    
    return fields;
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    if (!this.collectionId) {
      return { status: 'FAILED', error: 'Webflow collectionId not configured.' };
    }

    try {
      const isPublish = payload.status === 'publish';
      const fields = this.mapFields(payload);
      const slugKey = this.fieldMapping.slug || 'slug';

      // Duplicate prevention: check if an item with this slug already exists in the collection
      if (payload.slug) {
        try {
          const listRes = await ssrfSafeFetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items`, {
            method: 'GET',
            headers: this.getHeaders(),
            timeoutMs: 10000,
          });
          if (listRes.ok) {
            const listData = await listRes.json().catch(() => ({}));
            const items = Array.isArray(listData.items) ? listData.items : [];
            const existing = items.find((item: any) =>
              item?.fieldData?.[slugKey] === payload.slug || item?.fieldData?.slug === payload.slug
            );
            if (existing && existing.id) {
              return await this.updateArticle(existing.id, payload);
            }
          }
        } catch {
          // If pre-check fails (e.g. timeout), proceed to creation
        }
      }

      const res = await ssrfSafeFetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          fieldData: fields,
          isArchived: false,
          isDraft: !isPublish,
        }),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        // Fallback: If Webflow rejected due to duplicate slug, find the item and update it
        if (payload.slug && (res.status === 400 || res.status === 409) && /already taken|duplicate|unique|conflict/i.test(errorText)) {
          try {
            const listRes = await ssrfSafeFetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items`, {
              method: 'GET',
              headers: this.getHeaders(),
              timeoutMs: 10000,
            });
            if (listRes.ok) {
              const listData = await listRes.json().catch(() => ({}));
              const items = Array.isArray(listData.items) ? listData.items : [];
              const existing = items.find((item: any) =>
                item?.fieldData?.[slugKey] === payload.slug || item?.fieldData?.slug === payload.slug
              );
              if (existing && existing.id) {
                return await this.updateArticle(existing.id, payload);
              }
            }
          } catch {}
        }
        return { status: 'FAILED', error: `Webflow publish failed: ${errorText.substring(0, 200)}` };
      }

      const data = await res.json().catch(() => ({}));
      const remoteId = data.id;

      // In Webflow v2, if publishing live, trigger item publish endpoint
      if (isPublish && remoteId) {
        await ssrfSafeFetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items/publish`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ itemIds: [remoteId] }),
          timeoutMs: 10000,
        }).catch(() => null);
      }

      return {
        remoteId,
        remoteUrl: payload.slug ? `https://webflow.io/${payload.slug}` : undefined, 
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
      const isPublish = payload.status === 'publish';
      const fields = this.mapFields(payload);

      const res = await ssrfSafeFetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items/${remoteId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({
          fieldData: fields,
          isArchived: false,
          isDraft: !isPublish,
        }),
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return { status: 'FAILED', error: `Webflow update failed: ${errorText.substring(0, 200)}` };
      }

      const data = await res.json().catch(() => ({}));

      if (isPublish && remoteId) {
        await ssrfSafeFetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items/publish`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ itemIds: [remoteId] }),
          timeoutMs: 10000,
        }).catch(() => null);
      }

      return {
        remoteId: data.id || remoteId,
        remoteUrl: payload.slug ? `https://webflow.io/${payload.slug}` : undefined,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Webflow update failed' };
    }
  }

  async deleteArticle(remoteId: string): Promise<boolean> {
    try {
      const res = await ssrfSafeFetch(`https://api.webflow.com/v2/collections/${this.collectionId}/items/${remoteId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        timeoutMs: 10000,
      });

      return res.ok;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to delete Webflow item');
    }
  }
}
