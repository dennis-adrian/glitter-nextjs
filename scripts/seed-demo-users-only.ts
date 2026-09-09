import { loadEnvConfig } from "@next/env";

import { applySyncedEnvToProcess } from "@/scripts/lib/sync-env-local";

applySyncedEnvToProcess();
loadEnvConfig(process.cwd());

/**
 * The demo-user half of `pnpm seed`, without `seedFestivals`.
 *
 * `scripts/seed.ts` runs both, and the festival seed inserts a whole synthetic
 * festival — sectors, stands, reservations, invoices, payments — which is noise
 * on a database restored from a real backup. This exists to get the seeded
 * admin (and the other role accounts) onto such a database and nothing else.
 */
async function main() {
  if (!process.env.POSTGRES_URL) {
    console.info("POSTGRES_URL is not set. Skipping seed.");
    return;
  }

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
    for (const user of result.users) {
      console.info(
        `[seed] ${user.key}: ${user.email} (local id=${user.localUserId}, clerk ${user.clerk})`,
      );
    }
    console.info(
      "Sign in with any seeded +clerk_test email and SEED_DEMO_PASSWORD (or the documented default).",
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("An error occurred while seeding demo users", err);
  process.exitCode = 1;
});
