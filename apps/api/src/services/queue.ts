import prisma from '../lib/database';

export class QueueService {
  /**
   * Enqueues a new background job.
   */
  static async enqueue(type: string, payload: any, nextRunAt: Date = new Date()) {
    return prisma.backgroundJob.create({
      data: {
        type,
        payload,
        status: 'QUEUED',
        nextRunAt,
      },
    });
  }

  /**
   * Claims a job atomically using FOR UPDATE SKIP LOCKED.
   * Render Worker ignores BACKLINK_VERIFICATION jobs owned by Trigger.dev.
   */
  static async claimJob(workerId: string) {
    const jobs = await prisma.$queryRaw<any[]>`
      UPDATE "BackgroundJob" 
      SET status = 'PROCESSING', "lockedAt" = NOW(), "lockedBy" = ${workerId} 
      WHERE id = (
        SELECT id FROM "BackgroundJob" 
        WHERE status = 'QUEUED' 
          AND "nextRunAt" <= NOW() 
          AND (
            type != 'BACKLINK_VERIFICATION' 
            OR (payload->>'executionProvider') IS DISTINCT FROM 'trigger'
          )
        ORDER BY "createdAt" ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED
      ) RETURNING *;
    `;
    
    return jobs.length > 0 ? jobs[0] : null;
  }

  /**
   * Marks a job as completed.
   */
  static async completeJob(jobId: string) {
    return prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED' },
    });
  }

  /**
   * Marks a job as failed, and handles retries with exponential backoff.
   */
  static async failJob(jobId: string, error: string) {
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const newAttempts = job.attempts + 1;
    
    if (newAttempts >= job.maxAttempts) {
      return prisma.backgroundJob.update({
        where: { id: jobId },
        data: { 
          status: 'FAILED', 
          attempts: newAttempts,
          error 
        },
      });
    } else {
      // Exponential backoff: baseDelay * 2^attempts (e.g., 5s, 10s, 20s...)
      const baseDelaySeconds = 5;
      const delayMs = baseDelaySeconds * 1000 * Math.pow(2, job.attempts);
      const nextRunAt = new Date(Date.now() + delayMs);

      return prisma.backgroundJob.update({
        where: { id: jobId },
        data: { 
          status: 'QUEUED', 
          attempts: newAttempts,
          nextRunAt,
          lockedAt: null,
          lockedBy: null,
          error
        },
      });
    }
  }

  /**
   * Releases stale jobs stuck in PROCESSING state due to a worker crash.
   */
  static async recoverStaleJobs() {
    await prisma.$queryRaw`
      UPDATE "BackgroundJob" 
      SET status = 'QUEUED', "lockedAt" = NULL, "lockedBy" = NULL 
      WHERE status = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '1 hour';
    `;
  }
}
