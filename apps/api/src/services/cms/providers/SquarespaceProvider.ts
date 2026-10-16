import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';
import crypto from 'crypto';

/**
 * Squarespace CMS Provider
 *
 * NOTE: Squarespace does not provide an official public REST API for direct blog post creation/management
 * (Squarespace's public API is restricted to Commerce, Inventory, Profiles, and Webhook subscriptions).
 *
 * To integrate with Squarespace, this provider dispatches structured article payloads to a documented
 * Squarespace Automation Webhook (such as a Zapier/Make Squarespace connector or Squarespace extension bridge).
 */
export class SquarespaceProvider implements CmsProvider {
  private endpoint: string;
  private secretToken: string;

  constructor(public baseUrl: string, credentials: any = {}, config: any = {}) {
    this.endpoint = baseUrl || config?.webhookUrl || '';
    this.secretToken = credentials?.secretToken || credentials?.accessToken || '';

    if (!this.endpoint) {
      throw new CmsProviderError(
        'Squarespace requires a webhook automation endpoint (Zapier/Make/Custom Bridge). Please provide the webhook URL.'
      );
    }
  }

  private getHeaders(bodyPayload: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'RankAutonomous-Squarespace-Bridge/1.0',
    };

    if (this.secretToken) {
      // Provide both Bearer token and HMAC signature for maximum compatibility
      headers['Authorization'] = `Bearer ${this.secretToken}`;
      const signature = crypto
        .createHmac('sha256', this.secretToken)
        .update(bodyPayload)
        .digest('hex');
      headers['X-Squarespace-Bridge-Signature'] = signature;
    }

    return headers;
  }

  async testConnection(): Promise<boolean> {
    try {
      const pingBody = JSON.stringify({
        event: 'ping',
        platform: 'SQUARESPACE',
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
        throw new Error(`Squarespace webhook endpoint returned ${res.status}: ${errorText.substring(0, 150)}`);
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Squarespace webhook bridge');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const body = JSON.stringify({
        event: 'article.publish',
        platform: 'SQUARESPACE',
        article: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          scheduledAt: payload.scheduledAt,
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
          error: `Squarespace bridge dispatch failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.remoteId ? String(data.remoteId) : `sqs-${Date.now()}`,
        remoteUrl: data.remoteUrl || (payload.slug ? `https://squarespace.com/blog/${payload.slug}` : undefined),
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Squarespace publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const body = JSON.stringify({
        event: 'article.update',
        platform: 'SQUARESPACE',
        remoteId,
        article: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          scheduledAt: payload.scheduledAt,
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
          error: `Squarespace bridge update failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.remoteId ? String(data.remoteId) : remoteId,
        remoteUrl: data.remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Squarespace update failed' };
    }
  }
}
