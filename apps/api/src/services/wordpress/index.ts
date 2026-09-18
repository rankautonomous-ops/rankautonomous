import prisma from '../../lib/database';
import { encryptJson, decryptJson } from '../../lib/encryption';
import { sanitizeHtml } from '../aiContent/schema';
import {
  WordPressClient,
  WordPressApiError,
  normalizeWordPressUrl,
} from './client';
import {
  WordPressConfig,
  WordPressCredentials,
  WordPressPostPayload,
  CmsPublicationInfo,
} from './types';

export * from './types';
export * from './client';

/**
 * Tests WordPress connection without persisting credentials.
 */
export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  applicationPassword: string
) {
  const client = new WordPressClient(siteUrl, { username, applicationPassword });
  const result = await client.testConnection();

  return {
    success: true,
    siteUrl: client.siteUrl,
    username: client.username,
    user: result.user,
    canPublish: result.canPublish,
  };
}

/**
 * Saves or updates a WordPress integration for a website.
 * Tests connection first, encrypts credentials, and persists to Prisma.
 */
export async function saveWordPressIntegration(
  websiteId: string,
  siteUrl: string,
  username: string,
  applicationPassword: string
) {
  // 1. Verify connection and capabilities before saving
  const testResult = await testWordPressConnection(siteUrl, username, applicationPassword);

  if (!testResult.canPublish) {
    throw new WordPressApiError(
      `User "${username}" is connected, but lacks permission to publish or edit posts. Please use an Editor or Administrator account.`,
      403
    );
  }

  // 2. Encrypt credentials at rest
  const credentialsPayload: WordPressCredentials = {
    username: testResult.username,
    applicationPassword: applicationPassword.trim(),
  };
  const encryptedCredentials = encryptJson(credentialsPayload);

  // 3. Prepare public config (no secrets)
  const config: WordPressConfig = {
    siteUrl: testResult.siteUrl,
    username: testResult.username,
    siteName: testResult.user.name,
    lastTestedAt: new Date().toISOString(),
    canPublish: true,
  };

  // 4. Upsert into database
  const integration = await prisma.integration.upsert({
    where: {
      websiteId_provider: {
        websiteId,
        provider: 'WORDPRESS',
      },
    },
    create: {
      websiteId,
      provider: 'WORDPRESS',
      credentials: encryptedCredentials,
      config: config as any,
      status: 'ACTIVE',
    },
    update: {
      credentials: encryptedCredentials,
      config: config as any,
      status: 'ACTIVE',
    },
  });

  return {
    id: integration.id,
    websiteId: integration.websiteId,
    provider: integration.provider,
    config,
    status: integration.status,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

/**
 * Retrieves the WordPress integration status and non-sensitive configuration for a website.
 * Strictly omits sensitive credentials.
 */
export async function getWordPressIntegration(websiteId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: 'WORDPRESS',
      },
    },
  });

  if (!integration) {
    return {
      connected: false,
      integration: null,
    };
  }

  return {
    connected: integration.status === 'ACTIVE',
    integration: {
      id: integration.id,
      websiteId: integration.websiteId,
      provider: integration.provider,
      config: integration.config as WordPressConfig | null,
      status: integration.status,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    },
  };
}

/**
 * Disconnects (deletes) the WordPress integration for a website.
 */
export async function deleteWordPressIntegration(websiteId: string) {
  const existing = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: 'WORDPRESS',
      },
    },
  });

  if (!existing) {
    return { success: true, deleted: false };
  }

  await prisma.integration.delete({
    where: { id: existing.id },
  });

  return { success: true, deleted: true };
}

/**
 * Helper to retrieve decrypted WordPressClient for an integrated website.
 */
async function getClientForWebsite(websiteId: string): Promise<WordPressClient> {
  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: 'WORDPRESS',
      },
    },
  });

  if (!integration || !integration.credentials || integration.status !== 'ACTIVE') {
    throw new WordPressApiError(
      'WordPress is not connected for this website. Please connect WordPress in settings.',
      400
    );
  }

  const credentials = decryptJson<WordPressCredentials>(integration.credentials);
  const config = (integration.config || {}) as unknown as WordPressConfig;
  const siteUrl = config.siteUrl;

  if (!siteUrl) {
    throw new WordPressApiError(
      'WordPress integration is missing site URL configuration.',
      400
    );
  }

  return new WordPressClient(siteUrl, credentials);
}

/**
 * Publishes an approved article to WordPress.
 * Supports live publishing, draft creation, and scheduled publishing.
 * Guaranteed idempotent: if article was already published to WordPress, updates the existing post.
 */
export async function publishArticleToWordPress(
  websiteId: string,
  articleId: string,
  options: {
    postStatus?: 'publish' | 'draft' | 'future';
    scheduledAt?: string;
  } = {}
) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article || article.websiteId !== websiteId) {
    throw new WordPressApiError('Article not found for this website.', 404);
  }

  // Enforce workflow guard: Must be APPROVED or already PUBLISHED (for update)
  if (article.status !== 'APPROVED' && article.status !== 'PUBLISHED') {
    throw new WordPressApiError(
      `Cannot publish article with status "${article.status}". Article must be in "APPROVED" status before publishing.`,
      400
    );
  }

  if (!article.content || !article.title) {
    throw new WordPressApiError(
      'Article must have both a title and content to be published.',
      400
    );
  }

  const client = await getClientForWebsite(websiteId);

  // Determine publication status
  let targetStatus: 'publish' | 'draft' | 'future' = options.postStatus || 'publish';
  let dateGmt: string | undefined;

  if (targetStatus === 'future' || options.scheduledAt) {
    targetStatus = 'future';
    const scheduleDate = options.scheduledAt
      ? new Date(options.scheduledAt)
      : article.scheduledAt;

    if (!scheduleDate || isNaN(scheduleDate.getTime()) || scheduleDate <= new Date()) {
      throw new WordPressApiError(
        'A valid future schedule date is required for scheduled publishing.',
        400
      );
    }
    dateGmt = scheduleDate.toISOString();
  }

  // Clean and prepare content
  const cleanContent = sanitizeHtml(article.content);
  const postPayload: WordPressPostPayload = {
    title: article.title,
    content: cleanContent,
    slug: article.slug || undefined,
    status: targetStatus,
    excerpt: article.metaDescription || undefined,
    date_gmt: dateGmt,
  };

  const existingPubInfo = (article.cmsPublicationInfo as any) as CmsPublicationInfo | null;
  let wpResponse: any;

  // Idempotency: If post already exists on WordPress, update it
  if (existingPubInfo?.postId && existingPubInfo.provider === 'WORDPRESS') {
    try {
      wpResponse = await client.updatePost(existingPubInfo.postId, postPayload);
    } catch (updateErr: any) {
      // If post was deleted on WP (404), fallback to creating a fresh post
      if (updateErr.statusCode === 404) {
        wpResponse = await client.createPost(postPayload);
      } else {
        throw updateErr;
      }
    }
  } else {
    // New publication
    wpResponse = await client.createPost(postPayload);
  }

  const cmsPublicationInfo: CmsPublicationInfo = {
    provider: 'WORDPRESS',
    postId: wpResponse.id,
    postUrl: wpResponse.link,
    status: wpResponse.status,
    publishedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    siteUrl: client.siteUrl,
  };

  const updatedArticle = await prisma.article.update({
    where: { id: article.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: targetStatus === 'publish' ? new Date() : article.publishedAt,
      scheduledAt: targetStatus === 'future' && dateGmt ? new Date(dateGmt) : article.scheduledAt,
      cmsPublicationInfo: cmsPublicationInfo as any,
    },
  });

  return {
    success: true,
    article: updatedArticle,
    publicationInfo: cmsPublicationInfo,
  };
}

/**
 * Trashes a published WordPress post and updates article state.
 */
export async function trashWordPressPost(websiteId: string, articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article || article.websiteId !== websiteId) {
    throw new WordPressApiError('Article not found for this website.', 404);
  }

  const pubInfo = (article.cmsPublicationInfo as any) as CmsPublicationInfo | null;
  if (!pubInfo?.postId || pubInfo.provider !== 'WORDPRESS') {
    throw new WordPressApiError(
      'Article does not have an associated WordPress publication to delete.',
      400
    );
  }

  const client = await getClientForWebsite(websiteId);
  const deleteRes = await client.deletePost(pubInfo.postId, false);

  const updatedPubInfo: CmsPublicationInfo = {
    ...pubInfo,
    status: 'trash',
    lastSyncedAt: new Date().toISOString(),
  };

  const updatedArticle = await prisma.article.update({
    where: { id: article.id },
    data: {
      cmsPublicationInfo: updatedPubInfo as any,
    },
  });

  return {
    success: true,
    article: updatedArticle,
    publicationInfo: updatedPubInfo,
  };
}
