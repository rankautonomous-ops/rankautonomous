import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { ssrfSafeFetch } from '../../../lib/urlSafety';
import crypto from 'crypto';

/**
 * Lovable Provider
 *
 * NOTE: Lovable (lovable.dev) is an AI web app generator that produces React / Supabase fullstack applications.
 * Lovable does not have an official native blogging REST CMS endpoint.
 *
 * This provider delivers structured publication payloads directly to the customer's Lovable application
 * (such as a Lovable API endpoint, Next.js/Vite server route, or Supabase Edge Function configured in the Lovable app).
 */
export class LovableProvider implements CmsProvider {
  private endpoint: string;
  private secretToken: string;

  constructor(public baseUrl: string, credentials: any = {}, config: any = {}) {
    this.endpoint = baseUrl || config?.endpointUrl || '';
    this.secretToken = credentials?.secretToken || credentials?.accessToken || credentials?.token || '';

    if (!this.endpoint) {
      throw new CmsProviderError(
        'Lovable requires an application API route or Supabase Edge Function endpoint URL to publish articles.'
      );
    }
  }

  private getHeaders(payloadBody: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'RankAutonomous-Lovable-Connector/1.0',
    };

    if (this.secretToken) {
      headers['Authorization'] = `Bearer ${this.secretToken}`;
      const signature = crypto
        .createHmac('sha256', this.secretToken)
        .update(payloadBody)
        .digest('hex');
      headers['X-Lovable-Signature'] = signature;
    }

    return headers;
  }

  async testConnection(): Promise<boolean> {
    try {
      const pingBody = JSON.stringify({
        event: 'ping',
        source: 'rankautonomous',
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
        throw new Error(`Lovable application endpoint returned ${res.status}: ${errorText.substring(0, 150)}`);
      }

      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to connect to Lovable application endpoint');
    }
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const body = JSON.stringify({
        event: 'article.publish',
        source: 'rankautonomous',
        article: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          publishedAt: payload.status === 'publish' ? new Date().toISOString() : null,
          scheduledAt: payload.scheduledAt || null,
          tags: payload.tags || [],
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
          error: `Lovable dispatch failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.remoteId ? String(data.remoteId) : `lovable-${Date.now()}`,
        remoteUrl: data.remoteUrl || (payload.slug && this.endpoint.startsWith('http') ? `${new URL(this.endpoint).origin}/blog/${payload.slug}` : undefined),
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Lovable publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const body = JSON.stringify({
        event: 'article.update',
        source: 'rankautonomous',
        remoteId,
        article: {
          title: payload.title,
          content: payload.content,
          slug: payload.slug,
          excerpt: payload.excerpt,
          status: payload.status,
          scheduledAt: payload.scheduledAt || null,
          tags: payload.tags || [],
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
          error: `Lovable update failed (${res.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        remoteId: data.remoteId ? String(data.remoteId) : remoteId,
        remoteUrl: data.remoteUrl,
        status: 'PUBLISHED',
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Lovable update failed' };
    }
  }
}
