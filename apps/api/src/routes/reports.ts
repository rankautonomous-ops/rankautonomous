import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getReports, getReportById, generateMonthlyReport } from '../services/reports/monthlyReportService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

router.use(requireAuth);

// Ensure website ownership
router.use(async (req, res, next) => {
  const websiteId = (req.params as any).websiteId as string;
  const website = await prisma.website.findUnique({
    where: { id: websiteId }
  });
  if (!website || website.userId !== req.user!.id) {
    return res.status(404).json({ error: 'Website not found' });
  }
  next();
});

router.get('/', async (req, res) => {
  try {
    const websiteId = (req.params as any).websiteId as string;
    const reports = await getReports(websiteId);
    res.json({ reports });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const websiteId = (req.params as any).websiteId as string;
    const id = (req.params as any).id as string;
    const report = await getReportById(websiteId, id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json({ report });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const websiteId = (req.params as any).websiteId as string;
    const { year, month } = req.body;
    
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Valid year and month (1-12) are required.' });
    }

    const report = await generateMonthlyReport(websiteId, year, month);
    res.json({ report });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
