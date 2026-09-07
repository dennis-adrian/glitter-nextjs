import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "drizzle");
const migrationName = readdirSync(migrationDirectory).find((name) =>
  name.startsWith("0209_"),
);

if (!migrationName) {
  throw new Error("Phase 6 notification migration 0209 was not generated");
}

const migration = readFileSync(join(migrationDirectory, migrationName), "utf8");

describe("Phase 6 notification migration", () => {
  it("creates a durable, retryable, and deduplicated notification outbox", () => {
    expect(migration).toContain(
      'CREATE TABLE "disciplinary_notification_jobs"',
    );
    expect(migration).toContain('"attempts" integer DEFAULT 0 NOT NULL');
    expect(migration).toContain('"next_attempt_at" timestamp DEFAULT now()');
    expect(migration).toContain('"lease_owner" text');
    expect(migration).toContain(
      "disciplinary_notification_jobs_deduplication_key_unique",
    );
    expect(migration).toContain(
      "disciplinary_notification_jobs_status_next_attempt_idx",
    );
  });

  it("tracks reservation-access notification enqueueing per festival", () => {
    expect(migration).toContain(
      'ALTER TABLE "sanction_festivals" ADD COLUMN "reservation_access_notification_queued_at" timestamp',
    );
  });
});
