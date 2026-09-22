import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

import dotenv from "dotenv";
import path from "path";

// Ensure environment variables from repo root .env or local .env are loaded
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./src/trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    external: ["@prisma/client", ".prisma/client"],
    extensions: [
      prismaExtension({
        mode: "legacy",
        schema: "../../database/prisma/schema.prisma",
      }),
    ],
  },
});
