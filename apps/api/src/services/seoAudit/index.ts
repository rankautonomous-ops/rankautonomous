import prisma from '../../lib/database';
import { runTechnicalChecks } from './technicalChecks';
import { runOnPageChecks } from './onPageChecks';
import { runContentChecks } from './contentChecks';
import { runInternalLinkChecks } from './internalLinkChecks';
import { runPerformanceChecks } from './performanceChecks';
import { calculateOverallScore } from './scoring';
import { AuditContext, SeoCheckResult } from './types';

export async function startSeoAudit(seoAuditId: string): Promise<void> {
  const audit = await prisma.seoAudit.findUnique({
    where: { id: seoAuditId },
    include: { crawlJob: true }
  });

  if (!audit) return;

  try {
    await prisma.seoAudit.update({
      where: { id: seoAuditId },
      data: { status: 'PROCESSING' }
    });

    const pages = await prisma.pageResult.findMany({
      where: { crawlJobId: audit.crawlJobId }
    });

    const ctx: AuditContext = {
      websiteId: audit.websiteId,
      crawlJobId: audit.crawlJobId,
      pages
    };

    const results: SeoCheckResult[] = [
      runTechnicalChecks(ctx),
      runOnPageChecks(ctx),
      runContentChecks(ctx),
      runInternalLinkChecks(ctx),
      runPerformanceChecks(ctx)
    ];

    const overallScore = calculateOverallScore(results);

    const summaryData = results.map(r => ({
      category: r.category,
      score: r.score
    }));

    const allIssues = results.flatMap(r => r.issues);

    if (allIssues.length > 0) {
      await prisma.seoIssue.createMany({
        data: allIssues.map(iss => ({
          websiteId: audit.websiteId,
          seoAuditId: audit.id,
          title: iss.title,
          description: iss.description,
          category: iss.category,
          priority: iss.priority,
          affectedUrl: iss.affectedUrl,
          recommendation: iss.recommendation,
          status: 'OPEN'
        }))
      });
    }

    await prisma.seoAudit.update({
      where: { id: seoAuditId },
      data: {
        status: 'COMPLETED',
        healthScore: overallScore,
        summaryData
      }
    });

  } catch (err: any) {
    console.error(`[SEO Audit] Failed for audit ${seoAuditId}:`, err);
    await prisma.seoAudit.update({
      where: { id: seoAuditId },
      data: { status: 'FAILED' }
    });
  }
}
