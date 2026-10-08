import { schedules, logger } from '@trigger.dev/sdk/v3';
import prisma from '../lib/database';
import { isSubscriptionActive } from '../middleware/subscription';

export const trialExpirationCron = schedules.task({
  id: 'trial-expiration-cron',
  cron: '0 * * * *', // Run hourly
  run: async () => {
    logger.info('Starting trial expiration CRON');

    const now = new Date();

    // Find users whose trial has ended but they are not yet paused
    const usersWithExpiredTrials = await prisma.user.findMany({
      where: {
        trialActive: true,
        trialEndsAt: { lte: now },
        isPaused: false,
      },
      include: {
        subscriptions: {
          where: {
            status: { in: ['active', 'trialing', 'ACTIVE', 'TRIALING'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    let pausedCount = 0;
    let skippedCount = 0;

    for (const user of usersWithExpiredTrials) {
      try {
        const activeStripeSub = user.subscriptions[0];
        if (isSubscriptionActive(activeStripeSub)) {
          // User already subscribed, just disable the trial active state so we don't keep checking
          await prisma.user.update({
            where: { id: user.id },
            data: { trialActive: false }
          });
          skippedCount++;
        } else {
          // Pause the account
          await prisma.user.update({
            where: { id: user.id },
            data: { isPaused: true, trialActive: false }
          });
          
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'BILLING',
              title: 'Trial Expired',
              message: 'Your 3-day trial has ended. Please choose a subscription plan to reactivate your account and continue using RankAutonomous.',
            },
          });
          
          pausedCount++;
        }
      } catch (err: any) {
        logger.error(`Failed to process trial expiration for user ${user.id}`, { error: err.message });
      }
    }

    logger.info(`Processed ${usersWithExpiredTrials.length} expired trials. Paused: ${pausedCount}, Skipped: ${skippedCount}`);

    return {
      success: true,
      processed: usersWithExpiredTrials.length,
      paused: pausedCount,
      skipped: skippedCount
    };
  }
});
