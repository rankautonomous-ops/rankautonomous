import { task } from "@trigger.dev/sdk";

/**
 * Temporary health check task used to validate Trigger.dev configuration and connectivity.
 * This is a harmless testing task and does not perform any business logic or mutations.
 */
export const healthCheckTask = task({
  id: "health-check",
  run: async (payload: { timestamp?: string } = {}) => {
    const executedAt = payload.timestamp || new Date().toISOString();
    console.log(`[Trigger.dev Health Check] Task executed successfully at ${executedAt}`);

    return {
      status: "ok",
      executedAt,
      message: "Trigger.dev integration is operational",
    };
  },
});
