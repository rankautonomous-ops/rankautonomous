import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * GET /api/me
 * Returns the authenticated user's safe profile information.
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Strictly safe profile data - no tokens, hashes, or secrets
  res.json({
    user: {
      id: req.user.id,
      supabaseAuthId: req.user.supabaseAuthId,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      createdAt: req.user.createdAt,
    },
  });
});

/**
 * GET /api/admin/check
 * Verifies admin authorization. Accessible only by users with ADMIN role.
 */
router.get('/admin/check', requireAuth, requireAdmin, (req: Request, res: Response) => {
  res.json({
    status: 'authorized',
    role: req.user?.role,
    message: 'Welcome to the RankAutonomous Admin Area.',
  });
});

export default router;
