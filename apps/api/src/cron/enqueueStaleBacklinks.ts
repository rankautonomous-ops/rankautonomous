import '../lib/env'; // Load env variables
import prisma from '../lib/database';

/**
 * Enqueues backlink verification jobs for UNVERIFIED and stale backlinks.
 */
export async function run() {
  const BATCH_SIZE = parseInt(process.env.BACKLINK_VERIFICATION_BATCH_SIZE || '500', 10);
  const STALE_DAYS = parseInt(process.env.BACKLINK_VERIFICATION_STALE_DAYS || '14', 10);

  console.log(`[EnqueueStaleBacklinks] Starting execution. BATCH_SIZE=${BATCH_SIZE}, STALE_DAYS=${STALE_DAYS}`);
  
  try {
    const staleDateThreshold = new Date();
    staleDateThreshold.setDate(staleDateThreshold.getDate() - STALE_DAYS);

    // Fetch backlinks that need verification
    // Priority 1: UNVERIFIED
    // Priority 2: Stale (VERIFIED, MISSING, ERROR with lastChecked < staleDateThreshold)
    const backlinks = await prisma.backlink.findMany({
      where: {
        OR: [
          { verificationStatus: 'UNVERIFIED' },
          {
            verificationStatus: { in: ['VERIFIED', 'MISSING', 'ERROR'] },
            lastChecked: { lt: staleDateThreshold }
          }
        ]
      },
      orderBy: [
        { verificationStatus: 'desc' }, // 'UNVERIFIED' is alphabetically after 'VERIFIED'/'MISSING'/'ERROR'
        { lastChecked: 'asc' },
        { id: 'asc' }
      ],
      take: BATCH_SIZE,
      select: {
        id: true,
        verificationStatus: true,
      }
    });

    if (backlinks.length === 0) {
      console.log(`[EnqueueStaleBacklinks] No backlinks require verification. Exiting.`);
      return;
    }

    console.log(`[EnqueueStaleBacklinks] Found ${backlinks.length} backlinks to evaluate.`);

    let enqueuedCount = 0;
    
    // Process in smaller chunks to avoid massive SQL query strings
    const CHUNK_SIZE = 100;
    for (let i = 0; i < backlinks.length; i += CHUNK_SIZE) {
      const chunk = backlinks.slice(i, i + CHUNK_SIZE);
      
      for (const bl of chunk) {
        // Calculate jitter
        // UNVERIFIED: between 0 and 60 minutes
        // Stale: between 0 and 24 hours
        let jitterMs = 0;
        if (bl.verificationStatus === 'UNVERIFIED') {
          jitterMs = Math.floor(Math.random() * 60 * 60 * 1000); 
        } else {
          jitterMs = Math.floor(Math.random() * 24 * 60 * 60 * 1000);
        }
        
        const nextRunAt = new Date(Date.now() + jitterMs);
        const payloadJson = JSON.stringify({ backlinkId: bl.id });
        
        // Use an atomic INSERT ... SELECT WHERE NOT EXISTS to prevent duplicates.
        // This is safe even if multiple cron instances run simultaneously.
        // We cannot rely on a Prisma unique constraint because the payload is JSON and Prisma lacks robust unique constraints for JSON fields.
        const inserted = await prisma.$executeRaw`
          INSERT INTO "BackgroundJob" (id, type, payload, status, attempts, "maxAttempts", "nextRunAt", "createdAt", "updatedAt")
          SELECT gen_random_uuid(), 'BACKLINK_VERIFICATION', ${payloadJson}::jsonb, 'QUEUED', 0, 3, ${nextRunAt}, NOW(), NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM "BackgroundJob" 
            WHERE type = 'BACKLINK_VERIFICATION' 
              AND status IN ('QUEUED', 'PROCESSING') 
              AND payload->>'backlinkId' = ${bl.id}
          )
        `;
        
        enqueuedCount += inserted;
      }
    }

    console.log(`[EnqueueStaleBacklinks] Successfully enqueued ${enqueuedCount} new verification jobs.`);
    
  } catch (error) {
    console.error(`[EnqueueStaleBacklinks] FATAL ERROR:`, error);
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
