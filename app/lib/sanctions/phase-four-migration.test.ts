import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "drizzle");
const migrationName = readdirSync(migrationDirectory).find((name) =>
  name.startsWith("0208_"),
);

if (!migrationName) {
  throw new Error("Phase 4 migration 0208 was not generated");
}

const migration = readFileSync(join(migrationDirectory, migrationName), "utf8");

describe("Phase 4 sanction migration", () => {
  it("creates immutable festival status history and sanction associations", () => {
    expect(migration).toContain('CREATE TABLE "festival_status_events"');
    expect(migration).toContain('CREATE TABLE "sanction_festivals"');
    expect(migration).toContain(
      "festival_status_events_festival_id_festivals_id_fk",
    );
    expect(migration).toContain("ON DELETE restrict");
  });

  it("adds lifecycle audit events and association invariants", () => {
    expect(migration).toContain("ADD VALUE 'activated'");
    expect(migration).toContain("ADD VALUE 'festival_excluded'");
    expect(migration).toContain("ADD VALUE 'festival_restored'");
    expect(migration).toContain("ADD VALUE 'reservation_eligibility_changed'");
    expect(migration).toContain("sanction_festivals_exclusion_reason_check");
    expect(migration).toContain("sanction_festivals_count_snapshot_check");
  });
});
