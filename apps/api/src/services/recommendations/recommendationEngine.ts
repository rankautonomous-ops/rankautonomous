import { PrismaClient, SeoRecommendation } from '@prisma/client';
import { collectSignals } from './recommendationSources';
import { deduplicateRecommendations } from './recommendationDeduplication';
import { calculateScoreAndPriority } from './recommendationScoring';

const prisma = new PrismaClient();

export async function generateRecommendations(websiteId: string): Promise<SeoRecommendation[]> {
  // 1. Collect signals
  const rawCandidates = await collectSignals(websiteId);

  // 2. Deduplicate
  const candidates = deduplicateRecommendations(rawCandidates);

  const results: SeoRecommendation[] = [];

  // Use a transaction if possible, or just sequential upserts
  for (const candidate of candidates) {
    // 3. Score
    const { score, priority, impact, effort, confidence } = calculateScoreAndPriority(candidate);

    // 4. Persist
    // We use deduplicationKey to determine if this recommendation already exists.
    // If it exists and is OPEN or IN_PROGRESS, we update its score/metrics.
    // If it exists and is COMPLETED, maybe we do nothing (or re-open if regression? for now keep closed).
    
    const existing = await prisma.seoRecommendation.findUnique({
      where: { websiteId_deduplicationKey: { websiteId, deduplicationKey: candidate.deduplicationKey } }
    });

    if (existing) {
      if (existing.status === 'OPEN' || existing.status === 'SNOOZED') {
        const updated = await prisma.seoRecommendation.update({
          where: { id: existing.id },
          data: {
            score,
            priority,
            impact,
            effort,
            confidence,
            title: candidate.title, // Update title/desc in case it became more urgent
            description: candidate.description,
            lastEvaluatedAt: new Date(),
          }
        });
        results.push(updated);
      } else {
        // Just return existing without updating if it's IN_PROGRESS, COMPLETED, DISMISSED
        results.push(existing);
      }
    } else {
      const created = await prisma.seoRecommendation.create({
        data: {
          websiteId,
          type: candidate.type,
          category: candidate.category,
          title: candidate.title,
          description: candidate.description,
          priority,
          impact,
          effort,
          confidence,
          score,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          targetUrl: candidate.targetUrl,
          targetKeyword: candidate.targetKeyword,
          suggestedAction: candidate.suggestedAction,
          automationType: candidate.automationType,
          metadata: candidate.metadata,
          deduplicationKey: candidate.deduplicationKey,
          lastEvaluatedAt: new Date(),
        }
      });
      results.push(created);
    }
  }

  // 5. Stale recommendations handling
  // If an OPEN recommendation was NOT in this generated batch, it means the underlying issue is gone.
  // We should mark it as COMPLETED automatically.
  
  const generatedKeys = new Set(candidates.map(c => c.deduplicationKey));
  
  await prisma.seoRecommendation.updateMany({
    where: {
      websiteId,
      status: 'OPEN',
      deduplicationKey: { notIn: Array.from(generatedKeys) }
    },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      // optionally add a metadata note
    }
  });

  return results;
}
