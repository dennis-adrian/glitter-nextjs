import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RESERVATION_PHASE4_CONCURRENT_INDEXES,
  ensureReservationPhase4Indexes,
} from "@/scripts/lib/reservation-phase4-indexes";

const migrationSql = readFileSync(
  join(process.cwd(), "drizzle/0251_reservation_phase4_indexes.sql"),
  "utf8",
);
const migrateSource = readFileSync(
  join(process.cwd(), "scripts/migrate.ts"),
  "utf8",
);

describe("reservation Phase 4 concurrent indexes", () => {
  it("keeps duplicate cleanup in the drizzle migration and omits index builds", () => {
    expect(migrationSql).toContain('DELETE FROM "stand_subcategories"');
    expect(migrationSql).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
  });

  it("preserves the seven index names, tables, columns, and operators", () => {
    expect(RESERVATION_PHASE4_CONCURRENT_INDEXES).toHaveLength(7);
    expect(RESERVATION_PHASE4_CONCURRENT_INDEXES).toEqual([
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_reservation_user_status_idx" ON "invoices" USING btree ("reservation_id","user_id","status")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_invoice_id_created_at_idx" ON "payments" USING btree ("invoice_id","created_at")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "stand_reservations_festival_status_stand_idx" ON "stand_reservations" USING btree ("festival_id","status","stand_id")`,
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "stand_subcategories_stand_id_subcategory_id_unique" ON "stand_subcategories" USING btree ("stand_id","subcategory_id")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "stands_festival_category_participation_sector_status_idx" ON "stands" USING btree ("festival_id","stand_category","participation_type","festival_sector_id","status")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_requests_user_festival_type_status_terms_idx" ON "user_requests" USING btree ("user_id","festival_id","type","status","terms_version_id")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_display_name_normalized_trgm_idx" ON "users" USING gin (replace(lower("display_name"), ' ', '') gin_trgm_ops)`,
    ]);
  });

  it("runs each statement outside a transaction", async () => {
    const statements: string[] = [];
    await ensureReservationPhase4Indexes({
      query: async (sql) => {
        statements.push(sql);
      },
    });
    expect(statements).toEqual([...RESERVATION_PHASE4_CONCURRENT_INDEXES]);
    expect(statements.some((sql) => /\bBEGIN\b/i.test(sql))).toBe(false);
  });

  it("invokes the concurrent builder after drizzle migrate()", () => {
    const main = migrateSource.slice(
      migrateSource.indexOf("async function main()"),
    );
    const migrateCall = main.indexOf(
      'await migrate(db, { migrationsFolder: "./drizzle" })',
    );
    const ensureCall = main.indexOf(
      "await ensureReservationPhase4IndexesOnPool()",
    );
    expect(migrateCall).toBeGreaterThan(-1);
    expect(ensureCall).toBeGreaterThan(migrateCall);
  });
});
