import { PrismaClient, CmsConnection, Article, ArticlePublication } from '@prisma/client';
import { createCmsProvider } from './factory';
import { CmsPublishPayload, CmsProviderError } from './types';

const prisma = new PrismaClient();

export async function publishArticle(
  websiteId: string,
  articleId: string,
  cmsConnectionId: string,
  options: {
    postStatus?: 'publish' | 'draft' | 'future';
    scheduledAt?: string;
  } = {}
) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article || article.websiteId !== websiteId) {
    throw new Error('Article not found or does not belong to this website.');
  }

  // Ensure article is eligible
  if (article.status !== 'APPROVED' && article.status !== 'PUBLISHED') {
    throw new Error(`Cannot publish article with status "${article.status}". Article must be in "APPROVED" status.`);
  }

  if (!article.content || !article.title) {
    throw new Error('Article must have both a title and content to be published.');
  }

  const connection = await prisma.cmsConnection.findUnique({
    where: { id: cmsConnectionId },
  });

  if (!connection || connection.websiteId !== websiteId) {
    throw new Error('CMS Connection not found or does not belong to this website.');
  }

  if (connection.status !== 'CONNECTED') {
    throw new Error(`CMS Connection is in ${connection.status} state.`);
  }

  const provider = createCmsProvider(connection);

  let targetStatus: 'publish' | 'draft' | 'future' = options.postStatus || 'publish';
  
  if (targetStatus === 'future' || options.scheduledAt) {
    targetStatus = 'future';
    const scheduleDate = options.scheduledAt
      ? new Date(options.scheduledAt)
      : article.scheduledAt;

    if (!scheduleDate || isNaN(scheduleDate.getTime()) || scheduleDate <= new Date()) {
      throw new Error('A valid future schedule date is required for scheduled publishing.');
    }
  }

  const payload: CmsPublishPayload = {
    title: article.title,
    content: article.content,
    slug: article.slug || undefined,
    status: targetStatus,
    excerpt: article.metaDescription || undefined,
    scheduledAt: targetStatus === 'future' ? (options.scheduledAt || article.scheduledAt?.toISOString()) : undefined,
  };

  // Find existing publication record for this specific connection
  const existingPub = await prisma.articlePublication.findUnique({
    where: {
      articleId_cmsConnectionId: {
        articleId: article.id,
        cmsConnectionId: connection.id,
      },
    },
  });

  let result;
  try {
    if (existingPub && existingPub.remoteId) {
      // Update existing
      result = await provider.updateArticle(existingPub.remoteId, payload);
    } else {
      // New publish
      result = await provider.publishArticle(payload);
    }
  } catch (err: any) {
    result = {
      status: 'FAILED' as const,
      error: err.message || 'Unknown publishing error'
    };
  }

  // Save publication tracking
  const publicationRecord = await prisma.articlePublication.upsert({
    where: {
      articleId_cmsConnectionId: {
        articleId: article.id,
        cmsConnectionId: connection.id,
      },
    },
    create: {
      articleId: article.id,
      cmsConnectionId: connection.id,
      remoteId: result.remoteId,
      remoteUrl: result.remoteUrl,
      status: result.status,
      publishedAt: result.status === 'PUBLISHED' && targetStatus === 'publish' ? new Date() : undefined,
      lastError: result.error,
    },
    update: {
      remoteId: result.remoteId || undefined,
      remoteUrl: result.remoteUrl || undefined,
      status: result.status,
      publishedAt: result.status === 'PUBLISHED' && targetStatus === 'publish' ? new Date() : undefined,
      lastError: result.error || null,
    },
  });

  // Update Article global status if it was just APPROVED and this was a success
  if (article.status === 'APPROVED' && result.status === 'PUBLISHED') {
    await prisma.article.update({
      where: { id: article.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: targetStatus === 'publish' ? new Date() : undefined,
      },
    });
  }

  if (result.status === 'FAILED') {
    throw new CmsProviderError(result.error || 'Failed to publish to CMS');
  }

  return publicationRecord;
}
