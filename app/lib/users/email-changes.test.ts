// @vitest-environment node
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { scrubEmailChangesForUser } from "@/app/lib/users/email-changes";
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
