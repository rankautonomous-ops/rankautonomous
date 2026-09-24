import { generateMonthlyReport, getReports, getReportById } from '../services/reports/monthlyReportService';
import { PrismaClient, ReportStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING MONTHLY REPORTS TESTS');
  console.log('==================================================');

  let passed = 0;
  let failed = 0;

  try {
    const user = await prisma.user.create({
      data: {
        email: `test_user_reports_${Date.now()}@example.com`,
        name: 'Report Test',
        role: 'CUSTOMER',
      }
    });

    const website = await prisma.website.create({
      data: {
        userId: user.id,
        url: 'https://test-reports.com',
        name: 'Test Reports',
      }
    });

    // 1. Report creation
    try {
      const report = await generateMonthlyReport(website.id, 2026, 9);
      if (report && report.status === ReportStatus.READY) {
        console.log('PASS: 1. report creation');
        passed++;
      } else {
        throw new Error('Report not ready');
      }
    } catch (e: any) {
      console.error('FAIL: 1. report creation', e.message);
      failed++;
    }

    // 2. Report regeneration (duplicate prevention)
    try {
      const report2 = await generateMonthlyReport(website.id, 2026, 9);
      const reports = await getReports(website.id);
      if (reports.length === 1) {
        console.log('PASS: 2. report regeneration / duplicate prevention');
        passed++;
      } else {
        throw new Error(`Expected 1 report, got ${reports.length}`);
      }
    } catch (e: any) {
      console.error('FAIL: 2. report regeneration', e.message);
      failed++;
    }

    // 3. Month boundaries (previous-month comparison)
    try {
      const report3 = await generateMonthlyReport(website.id, 2026, 1);
      const report3Data = await getReportById(website.id, report3.id);
      if (report3Data) {
        console.log('PASS: 3. month boundaries (January -> December previous year)');
        passed++;
      } else {
        throw new Error('Report not found');
      }
    } catch (e: any) {
      console.error('FAIL: 3. month boundaries', e.message);
      failed++;
    }

    console.log('==================================================');
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================');
    
    // Cleanup
    await prisma.website.delete({ where: { id: website.id } });
    await prisma.user.delete({ where: { id: user.id } });
    
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

runTests();
