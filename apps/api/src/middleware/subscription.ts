import { Request, Response, NextFunction } from 'express';
import '../types/auth';
import prisma from '../lib/database';

export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'ACTIVE', 'TRIALING'] as const;

/**
 * Pure evaluation helper determining whether a given subscription object represents
 * an active or trialing entitlement without an expired currentPeriodEnd.
 */
export function isSubscriptionActive(
  subscription: { status: string; currentPeriodEnd?: Date | string | null } | null | undefined
): boolean {
  if (!subscription || !subscription.status) {
    return false;
  }

  const normalizedStatus = subscription.status.trim().toLowerCase();
  const isValidStatus = normalizedStatus === 'active' || normalizedStatus === 'trialing';

  if (!isValidStatus) {
    return false;
  }

  if (subscription.currentPeriodEnd) {
    const periodEnd = new Date(subscription.currentPeriodEnd);
    if (periodEnd.getTime() <= Date.now()) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a user has an active or trialing subscription in the database.
 * Evaluates both lowercase and uppercase statuses deterministically.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: {
          status: {
            in: ['active', 'trialing', 'ACTIVE', 'TRIALING'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
  });

  if (!user) return false;

  if (user.isPaused) {
    return false;
  }

  const activeStripeSub = user.subscriptions[0];
  if (isSubscriptionActive(activeStripeSub)) {
    return true;
  }

  if (user.trialActive && user.trialEndsAt && new Date(user.trialEndsAt).getTime() > Date.now()) {
    return true;
  }

  return false;
}

/**
 * Ensures the requesting user has an active subscription.
 * Note: ADMIN role bypasses this check automatically.
 * Account, profile, and billing management routes must NEVER use this middleware.
 */
export async function requireSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required.',
    });
    return;
  }

  // Administrators bypass subscription requirements
  if (req.user.role === 'ADMIN') {
    next();
    return;
  }

  const isActive = await hasActiveSubscription(req.user.id);

  if (!isActive) {
    res.status(403).json({
      error: 'Subscription Required',
      message: 'An active RankAutonomous subscription is required to access this resource.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }

  next();
}
