import { schedules } from '@trigger.dev/sdk/v3';
import { PrismaClient } from '@prisma/client';
import { generateMonthlyReport } from '../services/reports/monthlyReportService';

const prisma = new PrismaClient();

export const monthlySeoReportCron = schedules.task({
  id: 'monthly-seo-report-cron',
  cron: '0 0 1 * *', // Run at 00:00 on day-of-month 1
  maxDuration: 300,
  run: async (payload, { ctx }) => {
    console.log('[Trigger] Starting monthly SEO report generation run at:', new Date());

    const activeWebsites = await prisma.website.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true }
    });

    console.log(`[Trigger] Found ${activeWebsites.length} active websites.`);

    const now = new Date();
    // We want the previous month
    let targetYear = now.getUTCFullYear();
    let targetMonth = now.getUTCMonth(); // 0-11, so current month - 1 is exactly getUTCMonth() if we use 1-12 index.
    // E.g., if now is Oct (month 9 in 0-11), getUTCMonth() is 9.
    // The previous month is Sept, which is 9 in 1-12.
    // If now is Jan (month 0 in 0-11), getUTCMonth() is 0. Previous month is 12 of prev year.
    if (targetMonth === 0) {
      targetMonth = 12;
      targetYear -= 1;
    }

    let successCount = 0;
    let failureCount = 0;

    for (const site of activeWebsites) {
      try {
        await generateMonthlyReport(site.id, targetYear, targetMonth);
        successCount++;
      } catch (err: any) {
        console.error(`[Trigger] Failed to generate report for website ${site.id}:`, err.message);
        failureCount++;
      }
    }

    console.log(`[Trigger] Monthly report generation completed. Success: ${successCount}, Failures: ${failureCount}`);
  }
});
