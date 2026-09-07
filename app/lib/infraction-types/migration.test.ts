import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "drizzle");
const structuralName = readdirSync(migrationDirectory).find((name) =>
  name.startsWith("0210_"),
);
const catalogName = readdirSync(migrationDirectory).find((name) =>
  name.startsWith("0211_seed_infraction_types"),
);

if (!structuralName || !catalogName) {
  throw new Error("Infraction type migrations were not generated");
}

const structuralMigration = readFileSync(
  join(migrationDirectory, structuralName),
  "utf8",
);
const catalogMigration = readFileSync(
  join(migrationDirectory, catalogName),
  "utf8",
);

describe("infraction type migrations", () => {
  it("keeps lifecycle schema changes separate from catalog data", () => {
    expect(structuralMigration).toContain(
      'ALTER TABLE "infraction_types" ADD COLUMN "active"',
    );
    expect(structuralMigration).toContain(
      "infraction_types_archive_state_check",
    );
    expect(structuralMigration).not.toContain("stand_rules_violation");
    expect(catalogMigration).not.toContain("ALTER TABLE");
  });

  it("seeds every approved type idempotently", () => {
    const codes = [
      "no_show",
      "schedule_noncompliance",
      "stand_rules_violation",
      "product_or_content_violation",
      "administrative_noncompliance",
      "harassment_discrimination_or_threats",
      "unsafe_conduct_or_prohibited_substances",
      "unauthorized_use_of_content_or_image",
      "other_policy_violation",
    ];

    for (const code of codes) {
      expect(catalogMigration).toContain(`'${code}'`);
    }
    expect(catalogMigration).toContain("más de dos personas");
    expect(catalogMigration).toContain("credencial correspondiente");
    expect(catalogMigration).toContain("ON CONFLICT DO NOTHING");
  });
});
