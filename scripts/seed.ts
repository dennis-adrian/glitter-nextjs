import { loadEnvConfig } from "@next/env";

import { applySyncedEnvToProcess } from "@/scripts/lib/sync-env-local";

applySyncedEnvToProcess();
loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.info("POSTGRES_URL is not set. Skipping seed.");
    return;
  }

  // Import after env load so @/db and Zod env validation see .env.local.
  const { pool } = await import("@/db");
  const { getDevSeedGate, seedDemoUsers } = await import(
    "@/scripts/seed/demo-users"
  );

  const gate = getDevSeedGate();
  if (!gate.allowed) {
    console.info(`Skipping demo-user seed: ${gate.reason}`);
    await pool.end();
    return;
  }

  try {
    const result = await seedDemoUsers();
    console.info(
      `Demo user seed completed (${result.users.length} users; password from ${result.passwordSource}).`,
    );
    console.info(
      "Sign in with any seeded +clerk_test email and SEED_DEMO_PASSWORD (or the documented default).",
    );
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError.code === "ECONNREFUSED") {
      console.warn(
        "Could not connect to the database. Skipping seed. " +
          "Make sure your database is running and POSTGRES_URL is correct.",
      );
    } else {
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("An error occurred while attempting to seed the database", err);
  process.exitCode = 1;
});
