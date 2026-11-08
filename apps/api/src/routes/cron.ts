import express, { Request, Response, NextFunction } from 'express';
import { executeDailyCron, drainBackgroundJobs } from '../services/cronService';

const router = express.Router();

/**
 * Validates authentication for cron endpoints.
 * Supports:
 * - Authorization: Bearer <secret>
 * - x-cron-secret: <secret>
 * - Query parameter: ?secret=<secret>
 *
 * Matches against CRON_SECRET or TRIGGER_SECRET_KEY.
 */
export function requireCronAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = (req.headers['x-cron-secret'] as string) || '';
  const querySecret = (req.query.secret as string) || '';

  const provided = bearerToken || headerSecret || querySecret;
  const expected = process.env.CRON_SECRET || process.env.TRIGGER_SECRET_KEY;

  if (!expected || !provided || provided !== expected) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing cron secret authorization. Set CRON_SECRET in environment variables.',
    });
    return;
  }

  next();
}

/**
 * POST/GET /api/cron/daily-run
 * Triggered daily via external cron (GitHub Actions, cron-job.org, Vercel Cron).
 * Executes autonomous daily blog generation, CMS publishing, and backlink workflows.
 */
router.all('/daily-run', requireCronAuth, async (req: Request, res: Response): Promise<void> => {
  console.log('[Cron Route] Received authenticated daily-run trigger.');

  try {
    const result = await executeDailyCron();
    console.log('[Cron Route] Completed daily-run:', JSON.stringify(result));

    res.status(result.success ? 200 : 207).json({
      service: 'RankAutonomous Cron',
      status: result.success ? 'success' : 'partial_success',
      ...result,
    });
  } catch (error: any) {
    console.error('[Cron Route] Fatal error in daily-run:', error);
    res.status(500).json({
      service: 'RankAutonomous Cron',
      status: 'error',
      error: error.message || 'Daily cron execution failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST/GET /api/cron/backlinks-run
 * Triggered periodically to drain any pending backlink discovery/verification jobs.
 */
router.all('/backlinks-run', requireCronAuth, async (req: Request, res: Response): Promise<void> => {
  console.log('[Cron Route] Received authenticated backlinks-run trigger.');

  try {
    const count = await drainBackgroundJobs(20);
    res.status(200).json({
      service: 'RankAutonomous Cron',
      status: 'success',
      jobsProcessed: count,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Cron Route] Error in backlinks-run:', error);
    res.status(500).json({
      service: 'RankAutonomous Cron',
      status: 'error',
      error: error.message || 'Backlink queue draining failed',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

