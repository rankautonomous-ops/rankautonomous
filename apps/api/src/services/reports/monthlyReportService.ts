import { PrismaClient, SeoMonthlyReport, ReportStatus } from '@prisma/client';
import { getAiProvider } from '../aiProvider';
import { getSearchConsoleData } from '../google/searchConsoleService';
import { getAnalyticsData } from '../google/analyticsService';

const prisma = new PrismaClient();

export async function getReports(websiteId: string) {
  return prisma.seoMonthlyReport.findMany({
    where: { websiteId },
    orderBy: [{ reportYear: 'desc' }, { reportMonth: 'desc' }],
  });
}

export async function getReportById(websiteId: string, id: string) {
  return prisma.seoMonthlyReport.findFirst({
    where: { id, websiteId },
  });
}

export async function generateMonthlyReport(websiteId: string, year: number, month: number) {
  const website = await prisma.website.findUnique({
    where: { id: websiteId },
  });
  if (!website) throw new Error('Website not found');

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }
  const prevPeriodStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
  const prevPeriodEnd = new Date(Date.UTC(prevYear, prevMonth, 0, 23, 59, 59, 999));

  // Upsert initial report as GENERATING
  const report = await prisma.seoMonthlyReport.upsert({
    where: {
      websiteId_reportYear_reportMonth: {
        websiteId,
        reportYear: year,
        reportMonth: month,
      },
    },
    create: {
      websiteId,
      reportYear: year,
      reportMonth: month,
      periodStart,
      periodEnd,
      status: ReportStatus.GENERATING,
    },
    update: {
      periodStart,
      periodEnd,
      status: ReportStatus.GENERATING,
    },
  });

  try {
    // Collect data (Simulated or actual data queries)
    const currentAudit = await prisma.seoAudit.findFirst({
      where: { websiteId, createdAt: { lte: periodEnd } },
      orderBy: { createdAt: 'desc' },
    });
    
    const previousAudit = await prisma.seoAudit.findFirst({
      where: { websiteId, createdAt: { lte: prevPeriodEnd } },
      orderBy: { createdAt: 'desc' },
    });

    // Content
    const articlesPublished = await prisma.article.count({
      where: { websiteId, status: 'PUBLISHED', publishedAt: { gte: periodStart, lte: periodEnd } },
    });

    const articlesGenerated = await prisma.article.count({
      where: { websiteId, createdAt: { gte: periodStart, lte: periodEnd } },
    });

    const articlesAwaitingReview = await prisma.article.count({
      where: { websiteId, status: 'USER_REVIEW', createdAt: { lte: periodEnd } },
    });

    // Recommendations
    const recsCompleted = await prisma.seoRecommendation.count({
      where: { websiteId, status: 'COMPLETED', completedAt: { gte: periodStart, lte: periodEnd } },
    });

    const recsOpen = await prisma.seoRecommendation.count({
      where: { websiteId, status: 'OPEN' },
    });

    const recsCreated = await prisma.seoRecommendation.count({
      where: { websiteId, createdAt: { gte: periodStart, lte: periodEnd } },
    });

    // Backlinks
    const linksAcquired = await prisma.backlink.count({
      where: { websiteId, createdAt: { gte: periodStart, lte: periodEnd } },
    });

    const linksVerified = await prisma.backlink.count({
      where: { websiteId, status: 'VERIFIED' },
    });

    const linksMissing = await prisma.backlink.count({
      where: { websiteId, status: 'MISSING' },
    });
    
    const linksPending = await prisma.backlink.count({
      where: { websiteId, status: 'UNVERIFIED' },
    });

    // Keywords
    const trackedKeywords = await prisma.keyword.count({
      where: { websiteId, status: 'ACTIVE' },
    });

    // Fetch Search Console and GA4 Data safely
    let currentOrganicClicks = null;
    let prevOrganicClicks = null;
    let currentOrganicImpressions = null;
    let prevOrganicImpressions = null;
    let currentCtr = null;
    let prevCtr = null;
    let currentPosition = null;
    let prevPosition = null;
    
    // GSC logic
    try {
      const gscCurrent = await getSearchConsoleData(website.userId, website.url, periodStart.toISOString(), periodEnd.toISOString(), ['date']);
      if (gscCurrent && gscCurrent.rows) {
        currentOrganicClicks = gscCurrent.rows.reduce((sum: number, row: any) => sum + (row.clicks || 0), 0);
        currentOrganicImpressions = gscCurrent.rows.reduce((sum: number, row: any) => sum + (row.impressions || 0), 0);
        currentCtr = currentOrganicImpressions > 0 ? (currentOrganicClicks / currentOrganicImpressions) * 100 : 0;
        
        let totalPos = 0;
        let posCount = 0;
        gscCurrent.rows.forEach((row: any) => {
          if (row.position) {
            totalPos += row.position;
            posCount++;
          }
        });
        currentPosition = posCount > 0 ? totalPos / posCount : null;
      }

      const gscPrev = await getSearchConsoleData(website.userId, website.url, prevPeriodStart.toISOString(), prevPeriodEnd.toISOString(), ['date']);
      if (gscPrev && gscPrev.rows) {
        prevOrganicClicks = gscPrev.rows.reduce((sum: number, row: any) => sum + (row.clicks || 0), 0);
        prevOrganicImpressions = gscPrev.rows.reduce((sum: number, row: any) => sum + (row.impressions || 0), 0);
        prevCtr = prevOrganicImpressions > 0 ? (prevOrganicClicks / prevOrganicImpressions) * 100 : 0;
        
        let totalPos = 0;
        let posCount = 0;
        gscPrev.rows.forEach((row: any) => {
          if (row.position) {
            totalPos += row.position;
            posCount++;
          }
        });
        prevPosition = posCount > 0 ? totalPos / posCount : null;
      }
    } catch (e) {
      // GSC unavailable
    }

    // GA4 Logic
    let currentSessions = null;
    let prevSessions = null;
    try {
      const gaCurrent = await getAnalyticsData(website.userId, website.url, periodStart.toISOString(), periodEnd.toISOString(), ['sessions']);
      if (gaCurrent && gaCurrent.rows) {
        currentSessions = gaCurrent.rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value, 10), 0);
      }
      
      const gaPrev = await getAnalyticsData(website.userId, website.url, prevPeriodStart.toISOString(), prevPeriodEnd.toISOString(), ['sessions']);
      if (gaPrev && gaPrev.rows) {
        prevSessions = gaPrev.rows.reduce((sum: number, row: any) => sum + parseInt(row.metricValues[0].value, 10), 0);
      }
    } catch (e) {
      // GA4 unavailable
    }

    // Generate deterministic summary
    let summaryLines = [];
    if (currentAudit?.healthScore !== undefined && previousAudit?.healthScore !== undefined) {
      summaryLines.push(`SEO score changed from ${previousAudit.healthScore} to ${currentAudit.healthScore}.`);
    } else if (currentAudit?.healthScore !== undefined) {
      summaryLines.push(`Current SEO score is ${currentAudit.healthScore}.`);
    }

    if (currentOrganicClicks !== null && prevOrganicClicks !== null) {
      const diff = currentOrganicClicks - prevOrganicClicks;
      const pct = prevOrganicClicks > 0 ? ((diff / prevOrganicClicks) * 100).toFixed(1) : 'N/A';
      const direction = diff >= 0 ? 'increased' : 'decreased';
      summaryLines.push(`Organic clicks ${direction} by ${pct}% (${currentOrganicClicks} total).`);
    }

    summaryLines.push(`${recsCompleted} recommendations were completed.`);
    summaryLines.push(`${linksAcquired} backlinks were acquired.`);
    summaryLines.push(`${articlesPublished} articles were published.`);

    let finalSummary = summaryLines.join(' ');
    
    // Attempt AI summary if possible
    try {
      const aiPrompt = `Turn these verified metrics into a concise 3-4 sentence prose summary. Do NOT invent numbers. Metrics: ${finalSummary}`;
      const aiResponse = await getAiProvider().generateCompletion({
        systemPrompt: "You are an SEO analyst writing factual summaries based only on provided data.",
        userPrompt: aiPrompt
      });
      if (aiResponse && aiResponse.trim().length > 0) {
        finalSummary = aiResponse.trim();
      }
    } catch (aiErr) {
      // Fallback to deterministic
    }

    const reportData = {
      summary: finalSummary,
      content: {
        generated: articlesGenerated,
        published: articlesPublished,
        awaitingReview: articlesAwaitingReview
      },
      backlinks: {
        acquired: linksAcquired,
        verified: linksVerified,
        missing: linksMissing,
        pending: linksPending
      },
      recommendations: {
        created: recsCreated,
        completed: recsCompleted,
        open: recsOpen
      }
    };

    const finalReport = await prisma.seoMonthlyReport.update({
      where: { id: report.id },
      data: {
        status: ReportStatus.READY,
        generatedAt: new Date(),
        seoScore: currentAudit?.healthScore ?? null,
        previousSeoScore: previousAudit?.healthScore ?? null,
        organicClicks: currentOrganicClicks,
        previousOrganicClicks: prevOrganicClicks,
        organicImpressions: currentOrganicImpressions,
        previousOrganicImpressions: prevOrganicImpressions,
        organicCtr: currentCtr,
        previousOrganicCtr: prevCtr,
        averagePosition: currentPosition,
        previousAveragePosition: prevPosition,
        organicSessions: currentSessions,
        previousOrganicSessions: prevSessions,
        keywordsTracked: trackedKeywords,
        backlinksAcquired: linksAcquired,
        recommendationsCompleted: recsCompleted,
        recommendationsOpen: recsOpen,
        articlesPublished: articlesPublished,
        reportData: reportData
      },
    });

    return finalReport;
  } catch (err: any) {
    await prisma.seoMonthlyReport.update({
      where: { id: report.id },
      data: { status: ReportStatus.FAILED, reportData: { error: err.message } },
    });
    throw err;
  }
}
