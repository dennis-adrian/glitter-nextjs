// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import {
  EMAIL_CHANGE_CLERK_BUDGET_MS,
  EMAIL_CHANGE_WINDOW_MS,
  scrubEmailChangesForUser,
} from "@/app/lib/users/email-changes";
import { userEmailChanges } from "@/db/schema";

describe("scrubEmailChangesForUser", () => {
  it("blanks the addresses on the user's rows and nothing else", async () => {
    const written: Array<Record<string, unknown>> = [];
    const conditions: unknown[] = [];
    const updateMock = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        written.push(values);
        return {
          where: vi.fn((condition: unknown) => {
            conditions.push(condition);
            return Promise.resolve();
          }),
        };
      }),
    }));

    await scrubEmailChangesForUser({ update: updateMock } as never, 12);

    expect(updateMock).toHaveBeenCalledExactlyOnceWith(userEmailChanges);
    // Blank, not null: both columns are NOT NULL. Ids, the Clerk id, the
    // timestamps and the codes are not in the write, so they stay.
    expect(written).toEqual([
      { oldEmail: "", newEmail: "", updatedAt: expect.anything() },
    ]);
    const where = new PgDialect().sqlToQuery(conditions[0] as SQL);
    expect(where.sql).toBe('"user_email_changes"."user_id" = $1');
    expect(where.params).toEqual([12]);
  });
});

describe("the reservation window", () => {
  // Clerk cannot refuse a stale write, so the platform's function limit is
  // what keeps an older attempt from writing over a newer one.
  it("outlasts the functions' maxDuration in vercel.json by a margin", () => {
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { functions: Record<string, { maxDuration: number }> };
    const capMs = vercel.functions["app/**/*"]!.maxDuration * 1_000;

    expect(EMAIL_CHANGE_WINDOW_MS).toBeGreaterThanOrEqual(capMs + 20_000);
    // The Clerk half stops on its own before the platform stops it.
    expect(EMAIL_CHANGE_CLERK_BUDGET_MS).toBeLessThan(capMs);
  });
});
