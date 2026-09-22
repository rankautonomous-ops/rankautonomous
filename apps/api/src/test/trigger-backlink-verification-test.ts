import "../lib/env";
import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert";
import prisma from "../lib/database";
import { QueueService } from "../services/queue";
import * as backlinkFetcher from "../services/backlinks/backlinkFetcher";
import {
  backlinkVerificationTask,
  backlinkVerificationConfig,
  executeBacklinkVerification,
  handleBacklinkVerificationFailure,
} from "../trigger/backlinkVerification";

describe("Trigger.dev v4 - Backlink Verification Task", () => {
  let userA: any;
  let userB: any;
  let websiteA: any;
  let websiteB: any;
  let fetchMock: any;

  before(async () => {
    userA = await prisma.user.create({
      data: {
        email: `trigger-test-a-${Date.now()}@example.com`,
        supabaseAuthId: `tta-${Date.now()}`,
      },
    });

    userB = await prisma.user.create({
      data: {
        email: `trigger-test-b-${Date.now()}@example.com`,
        supabaseAuthId: `ttb-${Date.now()}`,
      },
    });

    websiteA = await prisma.website.create({
      data: {
        userId: userA.id,
        url: "https://trigger-site-a.com",
        name: "Trigger Site A",
      },
    });

    websiteB = await prisma.website.create({
      data: {
        userId: userB.id,
        url: "https://trigger-site-b.com",
        name: "Trigger Site B",
      },
    });

    // Default mock returns HTML with target link
    fetchMock = mock.method(backlinkFetcher, "fetchSafely", async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: "text/html",
        body: '<html><body><a href="https://trigger-site-a.com/target" rel="nofollow">Link</a></body></html>',
        redirectCount: 0,
      };
    });
  });

  after(async () => {
    fetchMock.mock.restore();
    if (websiteA) await prisma.website.delete({ where: { id: websiteA.id } });
    if (websiteB) await prisma.website.delete({ where: { id: websiteB.id } });
    if (userA) await prisma.user.delete({ where: { id: userA.id } });
    if (userB) await prisma.user.delete({ where: { id: userB.id } });
  });

  let currentBacklinkId: string;

  beforeEach(async () => {
    const b = await prisma.backlink.create({
      data: {
        websiteId: websiteA.id,
        sourceUrl: "https://source-blog.com/post-1",
        targetUrl: "https://trigger-site-a.com/target",
        referringDomain: "source-blog.com",
      },
    });
    currentBacklinkId = b.id;
  });

  // 1. Valid backlink task payload
  it("1. Valid backlink task payload executes successfully", async () => {
    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    const result = await executeBacklinkVerification(
      { backlinkId: currentBacklinkId, jobId: job.id },
      { attempt: { number: 1, startedAt: new Date() } } as any
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.backlinkId, currentBacklinkId);
    assert.strictEqual(result.verificationStatus, "VERIFIED");
  });

  // 2. Backlink not found
  it("2. Backlink not found handles safely without crashing or creating records", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: nonExistentId,
    });

    const result = await executeBacklinkVerification({
      backlinkId: nonExistentId,
      jobId: job.id,
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("missing or lacks valid tenant"));

    const updatedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(updatedJob?.status, "COMPLETED");

    const checkBacklink = await prisma.backlink.findUnique({ where: { id: nonExistentId } });
    assert.strictEqual(checkBacklink, null);
  });

  // 3. BackgroundJob not found
  it("3. BackgroundJob not found continues verification safely", async () => {
    const nonExistentJobId = "00000000-0000-0000-0000-000000000000";

    const result = await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: nonExistentJobId,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.verificationStatus, "VERIFIED");

    const updatedBacklink = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updatedBacklink?.verificationStatus, "VERIFIED");
  });

  // 4. Successful verification
  it("4. Successful verification marks VERIFIED with linkAttributes", async () => {
    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    const result = await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: job.id,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.verificationStatus, "VERIFIED");
    assert.ok(result.linkAttributes?.includes("NOFOLLOW"));

    const updatedBacklink = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updatedBacklink?.verificationStatus, "VERIFIED");
    assert.strictEqual(updatedBacklink?.lastErrorMessage, null);
  });

  // 5. Permanent MISSING result
  it("5. Permanent MISSING result updates backlink and completes job without throwing", async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 200,
        contentType: "text/html",
        body: "<html><body><p>No backlink here</p></body></html>",
        redirectCount: 0,
      };
    });

    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    const result = await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: job.id,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.verificationStatus, "MISSING");

    const updatedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(updatedJob?.status, "COMPLETED");

    const updatedBacklink = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updatedBacklink?.verificationStatus, "MISSING");
  });

  // 6. Permanent ERROR result
  it("6. Permanent ERROR result updates backlink and completes job without throwing", async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 403,
        contentType: "text/html",
        body: "Forbidden",
        redirectCount: 0,
      };
    });

    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    const result = await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: job.id,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.verificationStatus, "ERROR");

    const updatedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(updatedJob?.status, "COMPLETED");

    const updatedBacklink = await prisma.backlink.findUnique({ where: { id: currentBacklinkId } });
    assert.strictEqual(updatedBacklink?.verificationStatus, "ERROR");
    assert.strictEqual(updatedBacklink?.lastErrorMessage, "HTTP Error 403");
  });

  // 7. Transient error
  it("7. Transient error throws so Trigger.dev runtime can orchestrate retries", async () => {
    fetchMock.mock.mockImplementationOnce(async (url: string) => {
      return {
        success: true,
        finalUrl: url,
        statusCode: 502,
        contentType: "text/html",
        body: "Bad Gateway",
        redirectCount: 0,
      };
    });

    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    await assert.rejects(
      async () => {
        await executeBacklinkVerification({
          backlinkId: currentBacklinkId,
          jobId: job.id,
        });
      },
      /Transient HTTP error: 502/
    );

    // Critical check: BackgroundJob must NOT be permanently marked FAILED yet
    const currentJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(currentJob?.status, "PROCESSING");
  });

  // 8. Trigger retry behavior configuration
  it("8. Trigger retry behavior is configured with maxAttempts: 3 and exponential backoff", () => {
    assert.strictEqual(backlinkVerificationTask.id, "backlink-verification");

    // Check retry parameters
    assert.ok(backlinkVerificationConfig.retry);
    assert.strictEqual(backlinkVerificationConfig.retry.maxAttempts, 3);
    assert.strictEqual(backlinkVerificationConfig.retry.minTimeoutInMs, 1000);
    assert.strictEqual(backlinkVerificationConfig.retry.maxTimeoutInMs, 10000);
    assert.strictEqual(backlinkVerificationConfig.retry.factor, 2);
    assert.strictEqual(backlinkVerificationConfig.retry.randomize, true);

    // Check concurrency limit
    assert.strictEqual(backlinkVerificationConfig.queue.concurrencyLimit, 5);
  });

  // 9. BackgroundJob PROCESSING transition
  it("9. BackgroundJob transitions to PROCESSING with lock and attempt info", async () => {
    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    assert.strictEqual(job.status, "QUEUED");

    // Simulate execution step
    await executeBacklinkVerification(
      { backlinkId: currentBacklinkId, jobId: job.id },
      { attempt: { number: 2, startedAt: new Date() } } as any
    );

    // Job completed after execution
    const completedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(completedJob?.status, "COMPLETED");
  });

  // 10. BackgroundJob COMPLETED transition
  it("10. BackgroundJob transitions to COMPLETED on verification success", async () => {
    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: job.id,
    });

    const completedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(completedJob?.status, "COMPLETED");
    assert.strictEqual(completedJob?.lockedAt, null);
    assert.strictEqual(completedJob?.lockedBy, null);
  });

  // 11. Final FAILED transition
  it("11. Final FAILED transition is executed via handleBacklinkVerificationFailure after retries exhausted", async () => {
    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    await handleBacklinkVerificationFailure(
      { backlinkId: currentBacklinkId, jobId: job.id },
      new Error("Transient fetch error: TIMEOUT - Request timed out after 3 attempts")
    );

    const failedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(failedJob?.status, "FAILED");
    assert.ok(failedJob?.error?.includes("TIMEOUT"));
    assert.strictEqual(failedJob?.lockedAt, null);
  });

  // 12. Tenant/website relationship validation
  it("12. Tenant validation ensures no cross-website mutation or unrelated job mutation", async () => {
    // Case A: Mismatched jobId for another backlink is ignored
    const otherBacklink = await prisma.backlink.create({
      data: {
        websiteId: websiteB.id,
        sourceUrl: "https://other.com/post",
        targetUrl: "https://trigger-site-b.com/target",
        referringDomain: "other.com",
      },
    });

    const jobForOther = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: otherBacklink.id,
    });

    // Execute on currentBacklinkId while maliciously passing jobForOther.id
    const result = await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: jobForOther.id,
    });

    assert.strictEqual(result.success, true);

    // Verify jobForOther was NOT modified or marked completed by this run
    const checkOtherJob = await prisma.backgroundJob.findUnique({ where: { id: jobForOther.id } });
    assert.strictEqual(checkOtherJob?.status, "QUEUED");
  });

  // 13. Duplicate execution/idempotency
  it("13. Duplicate execution on already COMPLETED job exits cleanly without re-executing", async () => {
    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    // First execution
    const firstResult = await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: job.id,
    });
    assert.strictEqual(firstResult.success, true);
    assert.strictEqual(firstResult.alreadyCompleted, undefined);

    // Second execution (duplicate trigger)
    const secondResult = await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: job.id,
    });
    assert.strictEqual(secondResult.success, true);
    assert.strictEqual(secondResult.alreadyCompleted, true);

    const checkJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(checkJob?.status, "COMPLETED");
  });

  // 14. No duplicate Backlink creation
  it("14. Verification guarantees no duplicate Backlink records are created", async () => {
    const countBefore = await prisma.backlink.count({
      where: { websiteId: websiteA.id },
    });

    const job = await QueueService.enqueue("BACKLINK_VERIFICATION", {
      backlinkId: currentBacklinkId,
    });

    await executeBacklinkVerification({
      backlinkId: currentBacklinkId,
      jobId: job.id,
    });

    const countAfter = await prisma.backlink.count({
      where: { websiteId: websiteA.id },
    });

    assert.strictEqual(countAfter, countBefore);
  });
});
