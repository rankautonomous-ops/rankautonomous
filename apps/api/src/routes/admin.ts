import express, { Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import prisma from '../lib/database';

const router = express.Router();

// Apply admin guard to all routes in this file
router.use(requireAuth);
router.use(requireAdmin);

// Helper for pagination
function getPagination(req: Request) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

// ==================================================
// PHASE 3 — SYSTEM HEALTH
// ==================================================
router.get('/system-health', async (req: Request, res: Response) => {
  try {
    let dbStatus = 'PASS';
    let dbError = '';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = 'ERROR';
      dbError = err.message;
    }

    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured';
    const googleConfigured = !!process.env.GOOGLE_OAUTH_CLIENT_ID ? 'Configured' : 'Not configured';
    const triggerConfigured = !!process.env.TRIGGER_SECRET_KEY ? 'Configured' : 'Not configured';

    res.json({
      health: {
        database: { status: dbStatus, details: dbError },
        stripe: { status: stripeConfigured === 'Configured' ? 'PASS' : 'WARNING', details: stripeConfigured },
        googleOAuth: { status: googleConfigured === 'Configured' ? 'PASS' : 'WARNING', details: googleConfigured },
        triggerDev: { status: triggerConfigured === 'Configured' ? 'PASS' : 'WARNING', details: triggerConfigured },
        api: { status: 'PASS', details: 'OK' }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch system health', details: error.message });
  }
});

// ==================================================
// PHASE 3 — OVERVIEW DASHBOARD
// ==================================================
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const newUsers = await prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });
    
    const totalWebsites = await prisma.website.count();
    const activeWebsites = await prisma.website.count({ where: { status: 'ACTIVE' } });
    
    const activeSubscriptions = await prisma.subscription.count({ where: { status: 'active' } });
    const canceledSubscriptions = await prisma.subscription.count({ where: { status: 'canceled' } });

    const totalArticles = await prisma.article.count();
    const reviewArticles = await prisma.article.count({ where: { status: 'USER_REVIEW' } });
    const publishedArticles = await prisma.article.count({ where: { status: 'PUBLISHED' } });

    const totalAudits = await prisma.seoAudit.count();
    
    const totalKeywords = await prisma.keyword.count();

    const backlinkOpportunities = await prisma.backlinkOpportunity.count();
    const verifiedBacklinks = await prisma.backlink.count({ where: { verificationStatus: 'VERIFIED' } });

    const openRecommendations = await prisma.seoRecommendation.count({ where: { status: 'OPEN' } });
    const completedRecommendations = await prisma.seoRecommendation.count({ where: { status: 'COMPLETED' } });

    const pendingJobs = await prisma.backgroundJob.count({ where: { status: 'QUEUED' } });
    const runningJobs = await prisma.backgroundJob.count({ where: { status: 'PROCESSING' } });
    const failedJobs = await prisma.backgroundJob.count({ where: { status: 'FAILED' } });

    res.json({
      metrics: {
        users: { total: totalUsers, recent: newUsers },
        websites: { total: totalWebsites, active: activeWebsites },
        subscriptions: { active: activeSubscriptions, canceled: canceledSubscriptions },
        content: { total: totalArticles, pendingReview: reviewArticles, published: publishedArticles },
        seo: { totalAudits },
        keywords: { tracked: totalKeywords },
        backlinks: { opportunities: backlinkOpportunities, verified: verifiedBacklinks },
        recommendations: { open: openRecommendations, completed: completedRecommendations },
        jobs: { pending: pendingJobs, running: runningJobs, failed: failedJobs }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch overview metrics', details: error.message });
  }
});

// ==================================================
// PHASE 4 — USERS
// ==================================================
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const search = (req.query.search as string) || '';

    const where = search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { id: { contains: search, mode: 'insensitive' as const } }
      ]
    } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { 
          _count: { select: { websites: true } },
          subscriptions: { take: 1, orderBy: { createdAt: 'desc' } }
        }
      }),
      prisma.user.count({ where })
    ]);

    // Sanitize output
    const sanitizedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
      subscriptionStatus: u.subscriptions[0]?.status || 'none',
      createdAt: u.createdAt,
      websiteCount: u._count.websites
    }));

    res.json({ users: sanitizedUsers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        websites: { select: { id: true, url: true, status: true, createdAt: true } },
        auditLogs: { take: 10, orderBy: { createdAt: 'desc' } },
        subscriptions: { take: 1, orderBy: { createdAt: 'desc' } }
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        subscriptionStatus: user.subscriptions[0]?.status || 'none',
        createdAt: user.createdAt,
        websites: user.websites,
        recentActivity: user.auditLogs
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

router.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!['CUSTOMER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (role === 'CUSTOMER' && req.user?.id === req.params.id) {
      return res.status(400).json({ error: 'Cannot remove your own admin role' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { role }
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_ROLE',
        entityType: 'USER',
        entityId: updatedUser.id,
        userId: req.user?.id || 'SYSTEM',
        metadata: { newRole: role, status: 'SUCCESS' }
      }
    });

    res.json({ success: true, user: { id: updatedUser.id, role: updatedUser.role } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update user role', details: error.message });
  }
});

// ==================================================
// PHASE 6 — WEBSITES
// ==================================================
router.get('/websites', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const search = (req.query.search as string) || '';

    const where = search ? {
      url: { contains: search, mode: 'insensitive' as const }
    } : {};

    const [websites, total] = await Promise.all([
      prisma.website.findMany({
        where,
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true } },
          _count: { select: { articles: true, cmsConnections: true } }
        }
      }),
      prisma.website.count({ where })
    ]);

    res.json({ websites, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch websites', details: error.message });
  }
});

router.get('/websites/:id', async (req: Request, res: Response) => {
  try {
    const website = await prisma.website.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, email: true } },
        _count: { select: { articles: true, keywords: true, cmsConnections: true, seoMonthlyReports: true } }
      }
    });
    if (!website) return res.status(404).json({ error: 'Website not found' });
    res.json({ website });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch website', details: error.message });
  }
});

// ==================================================
// PHASE 7 — SUBSCRIPTIONS
// ==================================================
router.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    
    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true } } }
      }),
      prisma.subscription.count()
    ]);

    res.json({ subscriptions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch subscriptions', details: error.message });
  }
});

// ==================================================
// PHASE 8 — CONTENT
// ==================================================
router.get('/content', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const search = (req.query.search as string) || '';

    const where = search ? {
      title: { contains: search, mode: 'insensitive' as const }
    } : {};

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        skip, take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, createdAt: true, website: { select: { url: true } } }
      }),
      prisma.article.count({ where })
    ]);

    res.json({ articles, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch content', details: error.message });
  }
});

// ==================================================
// PHASE 9 — SEO
// ==================================================
router.get('/seo', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const [audits, total] = await Promise.all([
      prisma.seoAudit.findMany({
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { website: { select: { url: true } } }
      }),
      prisma.seoAudit.count()
    ]);
    res.json({ audits, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch seo audits', details: error.message });
  }
});

// ==================================================
// PHASE 10 — KEYWORDS
// ==================================================
router.get('/keywords', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const search = (req.query.search as string) || '';

    const where = search ? {
      keyword: { contains: search, mode: 'insensitive' as const }
    } : {};

    const [keywords, total] = await Promise.all([
      prisma.keyword.findMany({
        where,
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { website: { select: { url: true } } }
      }),
      prisma.keyword.count({ where })
    ]);
    res.json({ keywords, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch keywords', details: error.message });
  }
});

// ==================================================
// PHASE 11 — BACKLINKS
// ==================================================
router.get('/backlinks', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    
    const [backlinks, total] = await Promise.all([
      prisma.backlink.findMany({
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { website: { select: { url: true } } }
      }),
      prisma.backlink.count()
    ]);
    res.json({ backlinks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch backlinks', details: error.message });
  }
});

// ==================================================
// PHASE 12 — RECOMMENDATIONS
// ==================================================
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const search = (req.query.search as string) || '';

    const where = search ? {
      title: { contains: search, mode: 'insensitive' as const }
    } : {};

    const [recommendations, total] = await Promise.all([
      prisma.seoRecommendation.findMany({
        where,
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { website: { select: { url: true } } }
      }),
      prisma.seoRecommendation.count({ where })
    ]);
    res.json({ recommendations, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message });
  }
});

// ==================================================
// PHASE 13 — CMS CONNECTIONS
// ==================================================
router.get('/cms', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    
    const [connections, total] = await Promise.all([
      prisma.cmsConnection.findMany({
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { website: { select: { url: true, user: { select: { email: true } } } } }
      }),
      prisma.cmsConnection.count()
    ]);

    // Omit credentials!
    const sanitizedConnections = connections.map(c => ({
      id: c.id,
      websiteId: c.websiteId,
      provider: c.provider,
      name: c.name,
      status: c.status,
      baseUrl: c.baseUrl,
      metadata: c.metadata,
      lastTestedAt: c.lastTestedAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      website: c.website,
      credentialsStatus: c.credentials ? 'Configured' : 'Missing'
    }));

    res.json({ connections: sanitizedConnections, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch CMS connections', details: error.message });
  }
});

// ==================================================
// PHASE 14 & 15 — JOBS
// ==================================================
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const statusFilter = req.query.status as string;
    const where = statusFilter ? { status: statusFilter as any } : {};

    const [jobs, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        skip, take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.backgroundJob.count({ where })
    ]);
    res.json({ jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch jobs', details: error.message });
  }
});

router.post('/jobs/:id/retry', async (req: Request, res: Response) => {
  try {
    const job = await prisma.backgroundJob.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== 'FAILED') {
      return res.status(400).json({ error: 'Only failed jobs can be retried' });
    }

    // Only allow retry of certain safe background jobs
    const safeRetryTypes = ['SEO_CRAWL', 'AI_CONTENT_GEN', 'VERIFY_BACKLINK', 'GOOGLE_SYNC'];
    if (!safeRetryTypes.includes(job.type)) {
      return res.status(400).json({ error: 'This job type cannot be manually retried for safety reasons' });
    }

    const updatedJob = await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: 'QUEUED',
        error: null,
        attempts: job.attempts + 1
      }
    });

    await prisma.auditLog.create({
      data: {
        action: 'RETRY_JOB',
        entityType: 'BACKGROUND_JOB',
        entityId: job.id,
        userId: req.user?.id || 'SYSTEM',
        metadata: { jobType: job.type, status: 'SUCCESS' }
      }
    });

    res.json({ success: true, job: updatedJob });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retry job', details: error.message });
  }
});

// ==================================================
// PHASE 16 — REPORTS
// ==================================================
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const [reports, total] = await Promise.all([
      prisma.seoMonthlyReport.findMany({
        skip, take,
        orderBy: { createdAt: 'desc' },
        include: { website: { select: { url: true } } }
      }),
      prisma.seoMonthlyReport.count()
    ]);
    res.json({ reports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
  }
});

// ==================================================
// PHASE 17 — AUDIT LOGS
// ==================================================
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const { skip, take, page, limit } = getPagination(req);
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip, take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.auditLog.count()
    ]);
    res.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch audit logs', details: error.message });
  }
});

export default router;
