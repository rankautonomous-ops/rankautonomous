import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSubscription } from '../middleware/subscription';
import prisma from '../lib/database';
import { 
  normalizeCompetitorUrl, 
  extractDomain, 
  suggestCompetitors, 
  analyzeCompetitor, 
  promoteCompetitorKeyword 
} from '../services/competitors/competitorService';
import { CompetitorStatus } from '@prisma/client';

const router = Router({ mergeParams: true });

async function verifyWebsiteOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { websiteId } = req.params;
  const userId = req.user?.id;

  if (!websiteId || !userId) {
    res.status(400).json({ error: 'Bad Request', message: 'Missing websiteId or authentication context.' });
    return;
  }

  try {
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      select: { id: true, userId: true }
    });

    if (!website || website.userId !== userId) {
      res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
      return;
    }

    next();
  } catch (error) {
    console.error('[VerifyWebsiteOwnership Error]', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

router.use(requireAuth, requireSubscription, verifyWebsiteOwnership);

router.get('/', async (req: Request, res: Response) => {
  const { websiteId } = req.params;
  try {
    const competitors = await prisma.competitor.findMany({
      where: { websiteId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ data: competitors });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { websiteId } = req.params;
  const { url, name } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Bad Request', message: 'Valid url is required.' });
    return;
  }

  const normalized = normalizeCompetitorUrl(url);
  if (!normalized) {
    res.status(400).json({ error: 'Bad Request', message: 'Invalid URL.' });
    return;
  }

  const domain = extractDomain(normalized);
  if (!domain) {
    res.status(400).json({ error: 'Bad Request', message: 'Could not extract domain from URL.' });
    return;
  }

  try {
    const existing = await prisma.competitor.findUnique({
      where: { websiteId_domain: { websiteId, domain } }
    });
    
    if (existing) {
      res.status(409).json({ error: 'Conflict', message: 'Competitor already exists.' });
      return;
    }

    const competitor = await prisma.competitor.create({
      data: {
        websiteId,
        domain,
        url: normalized,
        name: name || domain,
        status: CompetitorStatus.DISCOVERED
      }
    });

    res.status(201).json(competitor);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:competitorId', async (req: Request, res: Response) => {
  const { websiteId, competitorId } = req.params;
  try {
    const existing = await prisma.competitor.findUnique({ where: { id: competitorId, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    await prisma.competitor.delete({ where: { id: competitorId, websiteId } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/suggest', async (req: Request, res: Response) => {
  const { websiteId } = req.params;
  try {
    const suggestions = await suggestCompetitors(websiteId);
    res.json({ data: suggestions });
  } catch (error: any) {
    console.error('[Competitor Suggest Error]', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/:competitorId/analyze', async (req: Request, res: Response) => {
  const { websiteId, competitorId } = req.params;
  try {
    const existing = await prisma.competitor.findUnique({ where: { id: competitorId, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const result = await analyzeCompetitor(competitorId, websiteId);
    res.json({ data: result });
  } catch (error: any) {
    console.error('[Competitor Analyze Error]', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/:competitorId/add-keyword', async (req: Request, res: Response) => {
  const { websiteId, competitorId } = req.params;
  const keywordData = req.body;

  if (!keywordData || !keywordData.keyword) {
    res.status(400).json({ error: 'Bad Request', message: 'Keyword is required.' });
    return;
  }

  try {
    const keyword = await promoteCompetitorKeyword(websiteId, competitorId, keywordData);
    res.json({ data: keyword });
  } catch (error: any) {
    if (error.message === 'Competitor not found') {
       res.status(404).json({ error: 'Not Found', message: error.message });
       return;
    }
    console.error('[Promote Keyword Error]', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
