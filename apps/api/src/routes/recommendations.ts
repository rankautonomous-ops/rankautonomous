import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateRecommendations } from '../services/recommendations/recommendationEngine';
import { executeRecommendation } from '../services/recommendations/recommendationExecution';

const prisma = new PrismaClient();
export const recommendationsRouter = Router({ mergeParams: true });

// POST /api/websites/:websiteId/recommendations/generate
recommendationsRouter.post('/generate', async (req, res) => {
  try {
    const { websiteId } = req.params as any;
    const recs = await generateRecommendations(websiteId);
    res.status(200).json({ success: true, count: recs.length, data: recs });
  } catch (error: any) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// GET /api/websites/:websiteId/recommendations
recommendationsRouter.get('/', async (req, res) => {
  try {
    const { websiteId } = req.params as any;
    const { status, category, priority, sourceType } = req.query;

    const where: any = { websiteId };
    
    // Explicitly handle array and single string query params to avoid type errors
    if (status) {
      where.status = { in: Array.isArray(status) ? status : [status] };
    } else {
      // By default, only return non-dismissed
      where.status = { not: 'DISMISSED' };
    }
    
    if (category) where.category = { in: Array.isArray(category) ? category : [category] };
    if (priority) where.priority = { in: Array.isArray(priority) ? priority : [priority] };
    if (sourceType) where.sourceType = { in: Array.isArray(sourceType) ? sourceType : [sourceType] };

    const recs = await prisma.seoRecommendation.findMany({
      where,
      orderBy: { score: 'desc' }
    });
    res.status(200).json(recs);
  } catch (error: any) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/websites/:websiteId/recommendations/:id
recommendationsRouter.get('/:id', async (req, res) => {
  try {
    const { websiteId, id } = req.params as any;
    const rec = await prisma.seoRecommendation.findUnique({
      where: { id }
    });

    if (!rec || rec.websiteId !== websiteId) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    res.status(200).json(rec);
  } catch (error: any) {
    console.error('Error fetching recommendation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/websites/:websiteId/recommendations/:id
recommendationsRouter.patch('/:id', async (req, res) => {
  try {
    const { websiteId, id } = req.params as any;
    const { status, priority, description } = req.body;

    const rec = await prisma.seoRecommendation.findUnique({ where: { id } });
    if (!rec || rec.websiteId !== websiteId) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const dataToUpdate: any = {};
    if (status) {
      dataToUpdate.status = status;
      if (status === 'COMPLETED') dataToUpdate.completedAt = new Date();
      if (status === 'DISMISSED') dataToUpdate.dismissedAt = new Date();
    }
    if (priority) dataToUpdate.priority = priority;
    if (description) dataToUpdate.description = description;

    const updated = await prisma.seoRecommendation.update({
      where: { id },
      data: dataToUpdate
    });

    res.status(200).json(updated);
  } catch (error: any) {
    console.error('Error updating recommendation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/websites/:websiteId/recommendations/:id/execute
recommendationsRouter.post('/:id/execute', async (req, res) => {
  try {
    const { websiteId, id } = req.params as any;
    const result = await executeRecommendation(id, websiteId);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error executing recommendation:', error);
    res.status(400).json({ error: 'Bad Request', message: error.message });
  }
});
