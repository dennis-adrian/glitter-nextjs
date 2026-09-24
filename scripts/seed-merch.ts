import { loadEnvConfig } from "@next/env";
import { applySyncedEnvToProcess } from "@/scripts/lib/sync-env-local";

applySyncedEnvToProcess();
loadEnvConfig(process.cwd());

async function main() {
  const { seedMerch } = await import("@/scripts/seed/merch");
  const { db, pool } = await import("@/db");
  try {
    const result = await seedMerch(db);
    console.info(
      `[seed] merch: ${result.createdProducts} products, ${result.createdCollections} collections created; existing fixtures preserved.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Merch seed failed", error);
  process.exitCode = 1;
});
