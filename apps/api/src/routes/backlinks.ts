import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSubscription } from '../middleware/subscription';
import prisma from '../lib/database';
import { validateAndNormalizeUrl } from './website';
import { OpportunityStatus, BacklinkOpportunityType } from '@prisma/client';

const router = Router({ mergeParams: true });

// Valid state transitions mapped
const VALID_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  [OpportunityStatus.DISCOVERED]: [OpportunityStatus.QUALIFIED, OpportunityStatus.REJECTED],
  [OpportunityStatus.QUALIFIED]: [OpportunityStatus.READY, OpportunityStatus.REJECTED],
  [OpportunityStatus.READY]: [OpportunityStatus.CONTACTED, OpportunityStatus.REJECTED],
  [OpportunityStatus.CONTACTED]: [OpportunityStatus.REPLIED, OpportunityStatus.REJECTED],
  [OpportunityStatus.REPLIED]: [OpportunityStatus.ACCEPTED, OpportunityStatus.REJECTED],
  [OpportunityStatus.ACCEPTED]: [OpportunityStatus.LINK_ACQUIRED, OpportunityStatus.REJECTED],
  [OpportunityStatus.LINK_ACQUIRED]: [], // Terminal success
  [OpportunityStatus.REJECTED]: [OpportunityStatus.DISCOVERED], // Can be resurrected
};

// Valid opportunity types
const VALID_TYPES = Object.values(BacklinkOpportunityType);

// Middleware to verify website ownership
async function verifyWebsiteOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { websiteId } = req.params;
  const userId = req.user?.id;

  if (!websiteId || !userId) {
    console.error('verifyWebsiteOwnership MISSING:', { websiteId, userId, params: req.params, user: req.user });
    res.status(400).json({ error: 'Bad Request', message: 'Missing websiteId or authentication context.' });
    return;
  }

  try {
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      select: { id: true, userId: true }
    });

    if (!website || website.userId !== userId) {
      // Return 404 to hide existence from unauthorized users
      res.status(404).json({ error: 'Not Found', message: 'Website not found.' });
      return;
    }

    next();
  } catch (error) {
    console.error('[VerifyWebsiteOwnership Error]', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Ensure all routes require auth, subscription, and ownership
router.use(requireAuth, requireSubscription, verifyWebsiteOwnership);

// ============================================================================
// OPPORTUNITY ENDPOINTS
// ============================================================================

// List opportunities
router.get('/backlink-opportunities', async (req: Request, res: Response) => {
  const { websiteId } = req.params;
  const { status, type, domain, page = '1', limit = '50' } = req.query;

  try {
    const where: any = { websiteId };

    if (status && Object.values(OpportunityStatus).includes(status as OpportunityStatus)) {
      where.status = status;
    }
    if (type && VALID_TYPES.includes(type as BacklinkOpportunityType)) {
      where.type = type;
    }
    if (domain && typeof domain === 'string') {
      where.domain = { contains: domain, mode: 'insensitive' };
    }

    const skip = (Math.max(1, parseInt(page as string, 10)) - 1) * parseInt(limit as string, 10);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    const [opportunities, total] = await Promise.all([
      prisma.backlinkOpportunity.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.backlinkOpportunity.count({ where })
    ]);

    res.json({ data: opportunities, meta: { total, page: skip / take + 1, limit: take } });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get single opportunity
router.get('/backlink-opportunities/:id', async (req: Request, res: Response) => {
  const { websiteId, id } = req.params;

  try {
    const opportunity = await prisma.backlinkOpportunity.findUnique({
      where: { id, websiteId }
    });

    if (!opportunity) {
      res.status(404).json({ error: 'Not Found', message: 'Opportunity not found.' });
      return;
    }

    res.json(opportunity);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create opportunity manually
router.post('/backlink-opportunities', async (req: Request, res: Response) => {
  const { websiteId } = req.params;
  const { 
    domain, url, domainInfo, relevance, type, 
    contactInfo, status, suggestedAction, suggestedAnchor, domainAuthority 
  } = req.body;

  if (!domain || typeof domain !== 'string' || !domain.includes('.')) {
    res.status(400).json({ error: 'Bad Request', message: 'Valid domain is required.' });
    return;
  }

  if (!type || !VALID_TYPES.includes(type as BacklinkOpportunityType)) {
    res.status(400).json({ error: 'Bad Request', message: `Invalid opportunity type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  let finalStatus = OpportunityStatus.DISCOVERED;
  if (status) {
    if (!Object.values(OpportunityStatus).includes(status)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid status.' });
      return;
    }
    finalStatus = status;
  }

  if (url) {
    const urlCheck = validateAndNormalizeUrl(url);
    if (!urlCheck.valid) {
      res.status(400).json({ error: 'Bad Request', message: urlCheck.error });
      return;
    }
  }

  if (domainAuthority !== undefined && domainAuthority !== null) {
    if (typeof domainAuthority !== 'number' || domainAuthority < 0 || domainAuthority > 100) {
      res.status(400).json({ error: 'Bad Request', message: 'domainAuthority must be between 0 and 100.' });
      return;
    }
  }

  if (relevance !== undefined && relevance !== null) {
    if (typeof relevance !== 'number' || relevance < 0 || relevance > 100) {
      res.status(400).json({ error: 'Bad Request', message: 'relevance must be between 0 and 100.' });
      return;
    }
  }

  // Prevent giant payloads
  if (domainInfo && JSON.stringify(domainInfo).length > 5000) {
    res.status(400).json({ error: 'Bad Request', message: 'domainInfo payload too large.' });
    return;
  }
  if (contactInfo && JSON.stringify(contactInfo).length > 5000) {
    res.status(400).json({ error: 'Bad Request', message: 'contactInfo payload too large.' });
    return;
  }

  try {
    const opp = await prisma.backlinkOpportunity.create({
      data: {
        websiteId,
        domain,
        url: url ? validateAndNormalizeUrl(url).valid ? (validateAndNormalizeUrl(url) as any).normalizedUrl : null : null,
        domainInfo,
        relevance,
        type,
        contactInfo,
        status: finalStatus,
        suggestedAction,
        suggestedAnchor,
        domainAuthority
      }
    });

    res.status(201).json(opp);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update opportunity
router.patch('/backlink-opportunities/:id', async (req: Request, res: Response) => {
  const { websiteId, id } = req.params;
  const { 
    url, domainInfo, relevance, type, 
    contactInfo, suggestedAction, suggestedAnchor, domainAuthority 
  } = req.body;

  try {
    const existing = await prisma.backlinkOpportunity.findUnique({ where: { id, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const data: any = {};

    if (type) {
      if (!VALID_TYPES.includes(type)) {
        res.status(400).json({ error: 'Bad Request', message: 'Invalid type.' });
        return;
      }
      data.type = type;
    }

    if (url !== undefined) {
      if (url === null || url === '') {
        data.url = null;
      } else {
        const urlCheck = validateAndNormalizeUrl(url);
        if (!urlCheck.valid) {
          res.status(400).json({ error: 'Bad Request', message: urlCheck.error });
          return;
        }
        data.url = urlCheck.normalizedUrl;
      }
    }

    if (domainAuthority !== undefined) {
      if (domainAuthority !== null && (typeof domainAuthority !== 'number' || domainAuthority < 0 || domainAuthority > 100)) {
        res.status(400).json({ error: 'Bad Request', message: 'domainAuthority must be between 0 and 100.' });
        return;
      }
      data.domainAuthority = domainAuthority;
    }

    if (relevance !== undefined) {
      if (relevance !== null && (typeof relevance !== 'number' || relevance < 0 || relevance > 100)) {
        res.status(400).json({ error: 'Bad Request', message: 'relevance must be between 0 and 100.' });
        return;
      }
      data.relevance = relevance;
    }

    if (suggestedAction !== undefined) data.suggestedAction = suggestedAction;
    if (suggestedAnchor !== undefined) data.suggestedAnchor = suggestedAnchor;
    if (domainInfo !== undefined) data.domainInfo = domainInfo;
    if (contactInfo !== undefined) data.contactInfo = contactInfo;

    const updated = await prisma.backlinkOpportunity.update({
      where: { id, websiteId },
      data
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Transition Status
router.patch('/backlink-opportunities/:id/status', async (req: Request, res: Response) => {
  const { websiteId, id } = req.params;
  const { status, sourceUrl, targetUrl } = req.body;

  if (!status || !Object.values(OpportunityStatus).includes(status)) {
    res.status(400).json({ error: 'Bad Request', message: 'Valid status is required.' });
    return;
  }

  try {
    const existing = await prisma.backlinkOpportunity.findUnique({ where: { id, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const allowedNext = VALID_TRANSITIONS[existing.status as OpportunityStatus] || [];
    if (!allowedNext.includes(status)) {
      res.status(400).json({ 
        error: 'Bad Request', 
        message: `Invalid state transition from ${existing.status} to ${status}. Allowed next states: ${allowedNext.join(', ')}` 
      });
      return;
    }

    // Attempting to acquire link
    if (status === OpportunityStatus.LINK_ACQUIRED) {
      if (sourceUrl && targetUrl) {
        const sourceCheck = validateAndNormalizeUrl(sourceUrl);
        const targetCheck = validateAndNormalizeUrl(targetUrl);
        
        if (!sourceCheck.valid || !targetCheck.valid) {
          res.status(400).json({ error: 'Bad Request', message: 'Invalid sourceUrl or targetUrl for acquired backlink.' });
          return;
        }

        // Create the backlink
        await prisma.backlink.create({
          data: {
            websiteId,
            sourceUrl: sourceCheck.normalizedUrl,
            targetUrl: targetCheck.normalizedUrl,
            referringDomain: existing.domain,
            anchorText: existing.suggestedAnchor,
            status: 'ACTIVE'
          }
        });
      }
    }

    const updated = await prisma.backlinkOpportunity.update({
      where: { id, websiteId },
      data: { status }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete Opportunity
router.delete('/backlink-opportunities/:id', async (req: Request, res: Response) => {
  const { websiteId, id } = req.params;

  try {
    const existing = await prisma.backlinkOpportunity.findUnique({ where: { id, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    await prisma.backlinkOpportunity.delete({ where: { id, websiteId } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================================
// BACKLINK ENDPOINTS
// ============================================================================

// List backlinks
router.get('/backlinks', async (req: Request, res: Response) => {
  const { websiteId } = req.params;
  const { status, referringDomain, page = '1', limit = '50' } = req.query;

  try {
    const where: any = { websiteId };

    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (referringDomain && typeof referringDomain === 'string') {
      where.referringDomain = { contains: referringDomain, mode: 'insensitive' };
    }

    const skip = (Math.max(1, parseInt(page as string, 10)) - 1) * parseInt(limit as string, 10);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    const [backlinks, total] = await Promise.all([
      prisma.backlink.findMany({
        where,
        skip,
        take,
        orderBy: { firstDiscovered: 'desc' }
      }),
      prisma.backlink.count({ where })
    ]);

    res.json({ data: backlinks, meta: { total, page: skip / take + 1, limit: take } });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get single backlink
router.get('/backlinks/:id', async (req: Request, res: Response) => {
  const { websiteId, id } = req.params;

  try {
    const backlink = await prisma.backlink.findUnique({ where: { id, websiteId } });
    if (!backlink) {
      res.status(404).json({ error: 'Not Found', message: 'Backlink not found.' });
      return;
    }
    res.json(backlink);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create backlink
router.post('/backlinks', async (req: Request, res: Response) => {
  const { websiteId } = req.params;
  const { sourceUrl, targetUrl, referringDomain, anchorText, status } = req.body;

  if (!sourceUrl || !targetUrl || !referringDomain) {
    res.status(400).json({ error: 'Bad Request', message: 'sourceUrl, targetUrl, and referringDomain are required.' });
    return;
  }

  const sourceCheck = validateAndNormalizeUrl(sourceUrl);
  const targetCheck = validateAndNormalizeUrl(targetUrl);
  
  if (!sourceCheck.valid || !targetCheck.valid) {
    res.status(400).json({ error: 'Bad Request', message: 'Invalid sourceUrl or targetUrl format.' });
    return;
  }

  if (typeof referringDomain !== 'string' || !referringDomain.includes('.')) {
    res.status(400).json({ error: 'Bad Request', message: 'Valid referringDomain is required.' });
    return;
  }

  try {
    const backlink = await prisma.backlink.create({
      data: {
        websiteId,
        sourceUrl: sourceCheck.normalizedUrl,
        targetUrl: targetCheck.normalizedUrl,
        referringDomain,
        anchorText: typeof anchorText === 'string' ? anchorText : null,
        status: status === 'LOST' ? 'LOST' : 'ACTIVE',
      }
    });

    res.status(201).json(backlink);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update backlink
router.patch('/backlinks/:id', async (req: Request, res: Response) => {
  const { websiteId, id } = req.params;
  const { anchorText, status } = req.body;

  try {
    const existing = await prisma.backlink.findUnique({ where: { id, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const data: any = {};
    if (anchorText !== undefined) data.anchorText = typeof anchorText === 'string' ? anchorText : null;
    if (status !== undefined) {
      if (status !== 'ACTIVE' && status !== 'LOST') {
         res.status(400).json({ error: 'Bad Request', message: 'status must be ACTIVE or LOST' });
         return;
      }
      data.status = status;
    }

    const updated = await prisma.backlink.update({
      where: { id, websiteId },
      data
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete Backlink
router.delete('/backlinks/:id', async (req: Request, res: Response) => {
  const { websiteId, id } = req.params;

  try {
    const existing = await prisma.backlink.findUnique({ where: { id, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    await prisma.backlink.delete({ where: { id, websiteId } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

import { QueueService } from '../services/queue';
import { backlinkVerificationTask } from '../trigger/backlinkVerification';

// Queue Backlink Verification
router.post('/backlinks/:id/verify', async (req: Request, res: Response) => {
  const { websiteId, id: backlinkId } = req.params;

  try {
    const existing = await prisma.backlink.findUnique({ where: { id: backlinkId, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found', message: 'Backlink not found.' });
      return;
    }

    // Check for duplicate pending job using Prisma JSON path query
    const duplicateJob = await prisma.backgroundJob.findFirst({
      where: {
        type: 'BACKLINK_VERIFICATION',
        status: { in: ['QUEUED', 'PROCESSING'] },
        payload: {
          path: ['backlinkId'],
          equals: backlinkId,
        },
      },
      select: { id: true },
    });

    if (duplicateJob) {
      res.status(202).json({
        success: true,
        message: 'Backlink verification already queued',
        jobId: duplicateJob.id,
        backlinkId,
        verificationStatus: existing.verificationStatus
      });
      return;
    }

    const useTrigger = process.env.USE_TRIGGER_BACKLINK_VERIFICATION === 'true';
    const payload: { backlinkId: string; executionProvider?: string } = {
      backlinkId,
      ...(useTrigger ? { executionProvider: 'trigger' } : {})
    };

    const job = await QueueService.enqueue('BACKLINK_VERIFICATION', payload);

    // Feature flag: When enabled, trigger Trigger.dev task; otherwise Render Worker handles it as before
    if (useTrigger) {
      try {
        await backlinkVerificationTask.trigger({
          backlinkId,
          jobId: job.id,
        });
      } catch (triggerError: any) {
        console.error('[Trigger Dispatch Error] Failed to dispatch backlink verification to Trigger.dev:', triggerError);

        // Prevent leaving an orphaned QUEUED job that would block future requests and never execute
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: `Trigger dispatch failed: ${triggerError.message || 'Unknown error'}`,
            updatedAt: new Date(),
          },
        });

        res.status(500).json({
          error: 'Trigger Dispatch Error',
          message: 'Failed to dispatch backlink verification task',
          jobId: job.id,
        });
        return;
      }
    }

    res.status(202).json({
      success: true,
      message: 'Backlink verification queued',
      jobId: job.id,
      backlinkId,
      verificationStatus: existing.verificationStatus
    });
  } catch (error) {
    console.error('[Verify Backlink Error]', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get Verification Job Status
router.get('/backlinks/:id/verification-job', async (req: Request, res: Response) => {
  const { websiteId, id: backlinkId } = req.params;

  try {
    const existing = await prisma.backlink.findUnique({ where: { id: backlinkId, websiteId } });
    if (!existing) {
      res.status(404).json({ error: 'Not Found', message: 'Backlink not found.' });
      return;
    }

    // Safely get the most recent job for this backlink using Prisma ORM
    const latestJob = await prisma.backgroundJob.findFirst({
      where: {
        type: 'BACKLINK_VERIFICATION',
        payload: {
          path: ['backlinkId'],
          equals: backlinkId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        error: true,
      },
    });

    if (!latestJob) {
      res.json({ job: null });
      return;
    }

    res.json({
      job: {
        id: latestJob.id,
        status: latestJob.status,
        error: latestJob.error ? 'Verification failed' : null,
      },
    });
  } catch (error) {
    console.error('[Get Verification Job Error]', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
