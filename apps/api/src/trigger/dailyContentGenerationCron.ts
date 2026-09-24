import { schedules, logger } from '@trigger.dev/sdk/v3';
import prisma from '../lib/database';
import { dailyContentGeneration } from './dailyContentGeneration';

export const dailyContentGenerationCron = schedules.task({
  id: 'daily-content-generation-cron',
  cron: '0 8 * * *', // Run at 8:00 AM UTC every day
  run: async () => {
    logger.info('Starting daily content generation CRON');

    // Find all websites with automation enabled
    const websites = await prisma.website.findMany({
      where: { contentAutomationEnabled: true },
      select: { id: true }
    });

    logger.info(`Found ${websites.length} websites with automation enabled`);

    let triggeredCount = 0;

    for (const website of websites) {
      try {
        await dailyContentGeneration.trigger({
          websiteId: website.id
        });
        triggeredCount++;
      } catch (err: any) {
        logger.error(`Failed to trigger daily content generation for website ${website.id}`, { error: err.message });
      }
    }

    return {
      success: true,
      websitesFound: websites.length,
      websitesTriggered: triggeredCount
    };
  }
});
