import { task } from "@trigger.dev/sdk";
import prisma from "../lib/database";

/**
 * Temporary database connectivity health check task used to validate that
 * Trigger.dev tasks can connect to PostgreSQL/Supabase via the existing Prisma singleton.
 * Performs ONLY a harmless read-only count query and does NOT modify any data.
 */
export const databaseHealthCheckTask = task({
  id: "database-health-check",
  run: async (payload: { timestamp?: string } = {}) => {
    const executedAt = payload.timestamp || new Date().toISOString();

    // Perform a harmless read-only query using the existing Prisma client singleton
    const userCount = await prisma.user.count();

    console.log(
      `[Trigger.dev Database Health Check] Successfully connected to database. User count: ${userCount} at ${executedAt}`
    );

    // Return only safe diagnostic information - NEVER expose connection strings or credentials
    return {
      status: "ok",
      userCount,
      executedAt,
      message: "Database connectivity verified successfully",
    };
  },
});
