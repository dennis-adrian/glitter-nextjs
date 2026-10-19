import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { retryingSlugConflict } from "@/app/lib/posts/slug";

/** What node-postgres throws for a unique violation. */
const driverError = (constraint: string) =>
  Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}"`),
    { code: "23505", constraint },
  );

/**
 * What a drizzle query actually rethrows: `query`, `params` and `cause` only.
 * The code and constraint are on the cause, never on the error itself.
 */
const queryError = (constraint: string) =>
  new DrizzleQueryError(
    'insert into "posts" ("slug") values ($1)',
    ["borrador"],
    driverError(constraint),
  );

describe("retryingSlugConflict", () => {
  it("retries a slug conflict that drizzle wrapped in a DrizzleQueryError", async () => {
    let calls = 0;

    const result = await retryingSlugConflict(async () => {
      calls++;
      if (calls === 1) throw queryError("posts_slug_unique");
      return "segundo intento";
    });

    expect(calls).toBe(2);
    expect(result).toBe("segundo intento");
  });

  it("gives up on a wrapped conflict after the last attempt and rethrows it", async () => {
    let calls = 0;

    await expect(
      retryingSlugConflict(async () => {
        calls++;
        throw queryError("post_categories_slug_unique");
      }),
    ).rejects.toBeInstanceOf(DrizzleQueryError);
    expect(calls).toBe(3);
  });

  it("rethrows a wrapped unique violation on another constraint immediately", async () => {
    let calls = 0;

    await expect(
      retryingSlugConflict(async () => {
        calls++;
        throw queryError("post_share_links_token_unique");
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "post_share_links_token_unique" },
    });
    expect(calls).toBe(1);
  });
});
