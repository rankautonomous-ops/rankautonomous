import '../lib/env'; // Load env variables
import prisma from '../lib/database';
import { executeDailyContentGeneration } from '../trigger/dailyContentGeneration';

/**
 * Autonomous Daily Content Generation Cron Job.
 * Finds all active websites with content automation enabled,
 * picks the next eligible scheduled/planned article, and triggers rank-ready generation.
 * Enforces the strict 1-article-per-day limit per website.
 */
export async function run() {
  console.log('[DailyContentCron] Starting autonomous daily content generation cron run...');
  
  try {
    const websites = await prisma.website.findMany({
      where: { contentAutomationEnabled: true },
      select: {
        id: true,
        name: true,
        url: true,
        userId: true,
      }
    });

    console.log(`[DailyContentCron] Found ${websites.length} websites with content automation enabled.`);

    if (websites.length === 0) {
      console.log('[DailyContentCron] No automated websites found. Exiting.');
      return;
    }

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const site of websites) {
      try {
        console.log(`[DailyContentCron] Evaluating website ${site.id} (${site.name || site.url})...`);
        const result = await executeDailyContentGeneration({ websiteId: site.id });
        
        if (result.success) {
          successCount++;
          console.log(`[DailyContentCron] ✅ Generated article ${result.articleId} for website ${site.id}`);
        } else {
          skippedCount++;
          console.log(`[DailyContentCron] ℹ️ Skipped website ${site.id}: ${result.message}`);
        }
      } catch (siteError: any) {
        failedCount++;
        console.error(`[DailyContentCron] ❌ Error generating for website ${site.id}:`, siteError.message);
      }
    }

    console.log(`[DailyContentCron] Completed run. Summary: ${successCount} generated, ${skippedCount} skipped, ${failedCount} errors.`);
  } catch (error) {
    console.error('[DailyContentCron] FATAL ERROR:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  run().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
