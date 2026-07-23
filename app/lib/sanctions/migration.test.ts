import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "drizzle");
const migrationName = readdirSync(migrationDirectory).find((name) =>
  name.startsWith("0207_"),
);

if (!migrationName) {
  throw new Error("Phase 3 migration 0207 was not generated");
}

const migration = readFileSync(join(migrationDirectory, migrationName), "utf8");

describe("Phase 3 sanction migration", () => {
  it("blocks ambiguous legacy records before enforcing uniqueness", () => {
    const preflightPosition = migration.indexOf(
      "Phase 3 migration requires manual review",
    );
    const uniqueIndexPosition = migration.indexOf(
      'CREATE UNIQUE INDEX "sanction_infractions_infraction_id_unique"',
    );

    expect(preflightPosition).toBeGreaterThan(-1);
    expect(preflightPosition).toBeLessThan(uniqueIndexPosition);
    expect(migration).toContain("inactive sanctions must be classified");
    expect(migration).toContain(
      "reservation-delay sanctions have ambiguous legacy duration values",
    );
    expect(migration).not.toContain("DISTINCT ON");
  });

  it("backfills every remaining sanction and derives calendar expiration", () => {
    expect(migration).toContain("calculated_ends_at");
    expect(migration).toContain(
      "legacy.calculated_ends_at <= now() THEN 'expired'",
    );
    expect(migration).toContain('SELECT "id", "infraction_id", "created_at"');
  });

  it("adds database combination constraints after the backfill", () => {
    const backfillPosition = migration.indexOf('UPDATE "sanctions" AS s');
    const constraintPosition = migration.indexOf(
      "sanctions_validity_configuration_check",
    );

    expect(backfillPosition).toBeGreaterThan(-1);
    expect(constraintPosition).toBeGreaterThan(backfillPosition);
    expect(migration).toContain(
      "sanctions_reservation_delay_configuration_check",
    );
    expect(migration).toContain("sanctions_revocation_configuration_check");
  });
});
