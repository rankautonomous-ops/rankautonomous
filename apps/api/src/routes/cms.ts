import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireSubscription } from '../middleware/subscription';
import { encryptJson } from '../lib/encryption';
import { createCmsProvider } from '../services/cms/factory';
import { publishArticle } from '../services/cms/publishingService';

const router = Router();
const prisma = new PrismaClient();

// Helper to check ownership
const checkWebsiteOwnershipLocal = async (req: Request, res: Response) => {
  const website = await prisma.website.findUnique({
    where: { id: req.params.websiteId },
  });
  if (!website || website.userId !== req.user!.id) {
    res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
    return null;
  }
  return website;
};

/**
 * GET /api/websites/:websiteId/cms-connections
 */
router.get('/:websiteId/cms-connections', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  const website = await checkWebsiteOwnershipLocal(req, res);
  if (!website) return;

  const connections = await prisma.cmsConnection.findMany({
    where: { websiteId: website.id },
    orderBy: { createdAt: 'desc' },
  });

  // Redact credentials before sending
  const sanitized = connections.map(conn => ({
    id: conn.id,
    websiteId: conn.websiteId,
    provider: conn.provider,
    name: conn.name,
    status: conn.status,
    baseUrl: conn.baseUrl,
    metadata: conn.metadata,
    lastTestedAt: conn.lastTestedAt,
    lastError: conn.lastError,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  }));

  res.status(200).json({ connections: sanitized });
});

/**
 * POST /api/websites/:websiteId/cms-connections
 */
router.post('/:websiteId/cms-connections', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  const website = await checkWebsiteOwnershipLocal(req, res);
  if (!website) return;

  const { provider, name, baseUrl, credentials, metadata } = req.body;

  if (!provider || !name) {
    res.status(400).json({ error: 'Bad Request', message: 'provider and name are required.' });
    return;
  }

  let encryptedCredentials = null;
  if (credentials && Object.keys(credentials).length > 0) {
    encryptedCredentials = encryptJson(credentials);
  }

  try {
    const connection = await prisma.cmsConnection.create({
      data: {
        websiteId: website.id,
        provider,
        name,
        baseUrl,
        credentials: encryptedCredentials,
        metadata: metadata || {},
        status: 'DISCONNECTED',
      }
    });

    res.status(201).json({ 
      id: connection.id,
      provider: connection.provider,
      name: connection.name,
      status: connection.status 
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * PUT /api/websites/:websiteId/cms-connections/:id
 */
router.put('/:websiteId/cms-connections/:id', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  const website = await checkWebsiteOwnershipLocal(req, res);
  if (!website) return;

  const { name, baseUrl, credentials, metadata } = req.body;

  const existing = await prisma.cmsConnection.findUnique({
    where: { id: req.params.id }
  });

  if (!existing || existing.websiteId !== website.id) {
    res.status(404).json({ error: 'Not Found', message: 'Connection not found.' });
    return;
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
  if (metadata !== undefined) updateData.metadata = metadata;
  
  if (credentials) {
    updateData.credentials = encryptJson(credentials);
  }

  try {
    const connection = await prisma.cmsConnection.update({
      where: { id: existing.id },
      data: updateData
    });

    res.status(200).json({
      id: connection.id,
      provider: connection.provider,
      name: connection.name,
      status: connection.status 
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * POST /api/websites/:websiteId/cms-connections/:id/test
 */
router.post('/:websiteId/cms-connections/:id/test', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  const website = await checkWebsiteOwnershipLocal(req, res);
  if (!website) return;

  const connection = await prisma.cmsConnection.findUnique({
    where: { id: req.params.id }
  });

  if (!connection || connection.websiteId !== website.id) {
    res.status(404).json({ error: 'Not Found', message: 'Connection not found.' });
    return;
  }

  try {
    const provider = createCmsProvider(connection);
    await provider.testConnection();

    await prisma.cmsConnection.update({
      where: { id: connection.id },
      data: {
        status: 'CONNECTED',
        lastTestedAt: new Date(),
        lastError: null,
      }
    });

    res.status(200).json({ success: true, message: 'Connection successful.' });
  } catch (err: any) {
    await prisma.cmsConnection.update({
      where: { id: connection.id },
      data: {
        status: 'ERROR',
        lastTestedAt: new Date(),
        lastError: err.message || 'Connection failed',
      }
    });

    res.status(400).json({ error: 'Connection Failed', message: err.message });
  }
});

/**
 * DELETE /api/websites/:websiteId/cms-connections/:id
 */
router.delete('/:websiteId/cms-connections/:id', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  const website = await checkWebsiteOwnershipLocal(req, res);
  if (!website) return;

  const existing = await prisma.cmsConnection.findUnique({
    where: { id: req.params.id }
  });

  if (!existing || existing.websiteId !== website.id) {
    res.status(404).json({ error: 'Not Found', message: 'Connection not found.' });
    return;
  }

  await prisma.cmsConnection.delete({
    where: { id: existing.id }
  });

  res.status(200).json({ success: true });
});

/**
 * POST /api/websites/:websiteId/articles/:articleId/publish
 */
router.post('/:websiteId/articles/:articleId/publish', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  const website = await checkWebsiteOwnershipLocal(req, res);
  if (!website) return;

  const { cmsConnectionId, postStatus, scheduledAt } = req.body;

  if (!cmsConnectionId) {
    res.status(400).json({ error: 'Bad Request', message: 'cmsConnectionId is required.' });
    return;
  }

  try {
    const result = await publishArticle(website.id, req.params.articleId, cmsConnectionId, { postStatus, scheduledAt });
    res.status(200).json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Publish Error', message: err.message });
  }
});

/**
 * GET /api/websites/:websiteId/articles/:articleId/publications
 */
router.get('/:websiteId/articles/:articleId/publications', requireAuth, requireSubscription, async (req: Request, res: Response): Promise<void> => {
  const website = await checkWebsiteOwnershipLocal(req, res);
  if (!website) return;

  const article = await prisma.article.findUnique({
    where: { id: req.params.articleId }
  });

  if (!article || article.websiteId !== website.id) {
    res.status(404).json({ error: 'Not Found', message: 'Article not found.' });
    return;
  }

  const publications = await prisma.articlePublication.findMany({
    where: { articleId: article.id },
    include: {
      cmsConnection: {
        select: {
          id: true,
          name: true,
          provider: true
        }
      }
    }
  });

  res.status(200).json({ publications });
});

export default router;
