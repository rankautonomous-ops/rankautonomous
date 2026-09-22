import { task } from "@trigger.dev/sdk";
import type { TaskRunContext } from "@trigger.dev/sdk";
import prisma from "../lib/database";
import { verifyBacklink } from "../services/backlinks/verifyBacklink";

export interface BacklinkVerificationPayload {
  backlinkId: string;
  jobId?: string;
}

export interface BacklinkVerificationResult {
  success: boolean;
  backlinkId?: string;
  jobId?: string;
  verificationStatus?: string;
  linkAttributes?: string[];
  lastErrorMessage?: string | null;
  lastChecked?: Date | null;
  alreadyCompleted?: boolean;
  error?: string;
}

/**
 * Core business logic for Trigger.dev backlink verification.
 * Exported separately to enable clean, direct unit and integration testing.
 */
export async function executeBacklinkVerification(
  payload: BacklinkVerificationPayload,
  ctx?: Partial<TaskRunContext>
): Promise<BacklinkVerificationResult> {
  // 1. Validate backlinkId
  if (!payload || typeof payload.backlinkId !== "string" || !payload.backlinkId.trim()) {
    const errorMessage = "Invalid payload: backlinkId is required";
    console.warn(`[Trigger backlink-verification] ${errorMessage}`);

    if (payload?.jobId) {
      await prisma.backgroundJob.updateMany({
        where: { id: payload.jobId, type: "BACKLINK_VERIFICATION" },
        data: {
          status: "FAILED",
          error: errorMessage,
          updatedAt: new Date(),
        },
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }

  const { backlinkId, jobId } = payload;

  // 2. Load the Backlink from Prisma
  // 3. Load its Website relationship
  const backlink = await prisma.backlink.findUnique({
    where: { id: backlinkId },
    include: { website: true },
  });

  // 4. Confirm the backlink exists and belongs to a valid tenant/website
  if (!backlink || !backlink.website || !backlink.website.userId) {
    const message = `Backlink ${backlinkId} missing or lacks valid tenant. Skipping.`;
    console.warn(`[Trigger backlink-verification] ${message}`);

    if (jobId) {
      await prisma.backgroundJob.updateMany({
        where: { id: jobId, type: "BACKLINK_VERIFICATION" },
        data: {
          status: "COMPLETED",
          error: message,
          updatedAt: new Date(),
        },
      });
    }

    return {
      success: false,
      backlinkId,
      error: message,
    };
  }

  // 5. If jobId is provided, load the corresponding BackgroundJob
  let job = null;
  if (jobId) {
    const candidateJob = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
    });

    if (candidateJob) {
      const jobPayload = candidateJob.payload as Record<string, unknown> | null;
      if (candidateJob.type === "BACKLINK_VERIFICATION" && jobPayload?.backlinkId === backlinkId) {
        job = candidateJob;
      } else {
        console.warn(
          `[Trigger backlink-verification] BackgroundJob ${candidateJob.id} does not match backlinkId ${backlinkId}. Ignoring jobId.`
        );
      }
    } else {
      console.warn(
        `[Trigger backlink-verification] BackgroundJob ${jobId} not found in database. Proceeding with verification.`
      );
    }
  }

  // Idempotency: If the BackgroundJob is already COMPLETED, skip duplicate execution
  if (job && job.status === "COMPLETED") {
    console.log(
      `[Trigger backlink-verification] BackgroundJob ${job.id} is already COMPLETED. Skipping duplicate execution.`
    );
    return {
      success: true,
      backlinkId,
      jobId: job.id,
      alreadyCompleted: true,
    };
  }

  // 6. Update BackgroundJob to PROCESSING
  if (job) {
    const attemptNumber = ctx?.attempt?.number ?? 1;
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "PROCESSING",
        attempts: attemptNumber,
        lockedAt: new Date(),
        lockedBy: "trigger.dev:backlink-verification",
        updatedAt: new Date(),
      },
    });
  }

  // 7. Call the existing verifyBacklink() service
  // Note: verifyBacklink internally records VERIFIED, MISSING, or permanent ERROR on the Backlink record.
  // It only throws on transient errors (timeouts, 502/503/429 HTTP, network errors) or missing backlink.
  await verifyBacklink(backlinkId);

  // 8. On successful verification return:
  // 9. Permanent verification outcomes (VERIFIED, MISSING, ERROR) return cleanly without throwing.
  // Update BackgroundJob to COMPLETED.
  if (job) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      },
    });
  }

  const updatedBacklink = await prisma.backlink.findUnique({
    where: { id: backlinkId },
    select: {
      id: true,
      verificationStatus: true,
      linkAttributes: true,
      lastErrorMessage: true,
      lastChecked: true,
    },
  });

  return {
    success: true,
    backlinkId,
    jobId: job?.id,
    verificationStatus: updatedBacklink?.verificationStatus,
    linkAttributes: updatedBacklink?.linkAttributes,
    lastErrorMessage: updatedBacklink?.lastErrorMessage,
    lastChecked: updatedBacklink?.lastChecked,
  };
}

/**
 * Failure handler invoked when all Trigger.dev retries are exhausted.
 */
export async function handleBacklinkVerificationFailure(
  payload: BacklinkVerificationPayload,
  error: unknown
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(
    `[Trigger backlink-verification] All retries exhausted / final failure for backlink ${payload?.backlinkId}:`,
    errorMessage
  );

  if (payload?.jobId) {
    try {
      await prisma.backgroundJob.updateMany({
        where: { id: payload.jobId, type: "BACKLINK_VERIFICATION" },
        data: {
          status: "FAILED",
          error: errorMessage,
          lockedAt: null,
          lockedBy: null,
          updatedAt: new Date(),
        },
      });
    } catch (dbError) {
      console.error(
        `[Trigger backlink-verification] Failed to update BackgroundJob status to FAILED:`,
        dbError
      );
    }
  }
}

export const BACKLINK_VERIFICATION_TASK_ID = "backlink-verification";

export const backlinkVerificationConfig = {
  id: BACKLINK_VERIFICATION_TASK_ID,
  queue: {
    concurrencyLimit: 5,
  },
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
    randomize: true,
  },
} as const;

/**
 * Trigger.dev v4 backlink verification task.
 * Concurrency is configured conservatively to 5.
 * Retries are orchestrated with exponential backoff and jitter (max 3 attempts).
 */
export const backlinkVerificationTask = task({
  ...backlinkVerificationConfig,
  run: async (payload: BacklinkVerificationPayload, { ctx }) => {
    return executeBacklinkVerification(payload, ctx);
  },
  onFailure: async ({ payload, error }) => {
    await handleBacklinkVerificationFailure(payload, error);
  },
});
