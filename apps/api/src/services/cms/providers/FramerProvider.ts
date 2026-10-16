import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';
import crypto from 'crypto';

/**
 * Framer CMS Provider
 *
 * NOTE: Framer does not offer an open public REST API for direct third-party blog post creation without
 * running a desktop/web Framer plugin or headless synchronization bridge.
 *
 * This provider dispatches structured article payloads to a Framer CMS Webhook or Headless Sync Bridge
 * (such as a Next.js/Cloudflare sync worker or Zapier/Make Framer bridge) that synchronizes content into Framer CMS collections.
 */
export class FramerProvider implements CmsProvider {
  private endpoint: string;
  private authToken: string;
  private collectionName: string;

  constructor(public baseUrl: string, credentials: any = {}, config: any = {}) {
    this.endpoint = baseUrl || config?.webhookUrl || '';
    this.authToken = credentials?.accessToken || credentials?.token || '';
    this.collectionName = config?.collectionName || 'Blog';

    if (!this.endpoint) {
      throw new CmsProviderError(
        'Framer requires a CMS sync endpoint or webhook bridge URL. Please provide the webhook URL.'
      );
    }
  }

  private getHeaders(payloadBody: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'RankAutonomous-Framer-Bridge/1.0',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
      const signature = crypto
        .createHmac('sha256', this.authToken)
        .update(payloadBody)
        .digest('hex');
      headers['X-Framer-Bridge-Signature'] = signature;
    }

    return headers;
  }

  async testConnection(): Promise<boolean> {
    try {
      const pingBody = JSON.stringify({
        event: 'ping',
        platform: 'FRAMER',
        collection: this.collectionName,
        timestamp: new Date().toISOString(),
      });

      const res = await ssrfSafeFetch(this.endpoint, {
        method: 'POST',
        headers: this.getHeaders(pingBody),
        body: pingBody,
        timeoutMs: 10000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Framer sync bridge returned ${res.status}: ${errorText.substring(0, 150)}`);
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Framer sync bridge');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const body = JSON.stringify({
        event: 'article.publish',
        platform: 'FRAMER',
        collection: this.collectionName,
        item: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          date: payload.scheduledAt || new Date().toISOString(),
          tags: payload.tags,
        },
      });

      const res = await ssrfSafeFetch(this.endpoint, {
        method: 'POST',
        headers: this.getHeaders(body),
        body,
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `Framer bridge dispatch failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.remoteId ? String(data.remoteId) : `framer-${Date.now()}`,
        remoteUrl: data.remoteUrl || (payload.slug ? `https://framer.website/blog/${payload.slug}` : undefined),
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Framer publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const body = JSON.stringify({
        event: 'article.update',
        platform: 'FRAMER',
        collection: this.collectionName,
        remoteId,
        item: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          date: payload.scheduledAt || new Date().toISOString(),
          tags: payload.tags,
        },
      });

      const res = await ssrfSafeFetch(this.endpoint, {
        method: 'POST',
        headers: this.getHeaders(body),
        body,
        timeoutMs: 15000,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          status: 'FAILED',
          error: `Framer bridge update failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.remoteId ? String(data.remoteId) : remoteId,
        remoteUrl: data.remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Framer update failed' };
    }
  }
}
