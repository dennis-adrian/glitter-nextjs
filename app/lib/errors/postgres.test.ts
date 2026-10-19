import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { hasPgErrorCode, isUniqueViolationOn } from "@/app/lib/errors/postgres";

const driverError = (code: string, constraint?: string) =>
  Object.assign(new Error("driver error"), { code, constraint });

const wrapped = (cause: unknown) =>
  new DrizzleQueryError(
    "delete from festivals where id = $1",
    [1],
    cause as Error,
  );

describe("hasPgErrorCode", () => {
  it("finds the code on the cause of a DrizzleQueryError", () => {
    expect(hasPgErrorCode(wrapped(driverError("23503")), "23503")).toBe(true);
  });

  it("finds the code on an unwrapped driver error", () => {
    expect(hasPgErrorCode(driverError("40001"), "23505", "40001")).toBe(true);
  });

  it("does not match other codes or errors without one", () => {
    expect(hasPgErrorCode(wrapped(driverError("23505")), "23503")).toBe(false);
    expect(hasPgErrorCode(new Error("boom"), "23505")).toBe(false);
    expect(hasPgErrorCode(null, "23505")).toBe(false);
    expect(hasPgErrorCode("23505", "23505")).toBe(false);
  });
});

describe("isUniqueViolationOn", () => {
  const isSlug = (constraint: string) => constraint.includes("slug");

  it("matches a wrapped unique violation on an accepted constraint", () => {
    expect(
      isUniqueViolationOn(
        wrapped(driverError("23505", "posts_slug_unique")),
        isSlug,
      ),
    ).toBe(true);
  });

  it("does not match another constraint or another code", () => {
    expect(
      isUniqueViolationOn(
        wrapped(driverError("23505", "post_share_links_token_unique")),
        isSlug,
      ),
    ).toBe(false);
    expect(
      isUniqueViolationOn(
        wrapped(driverError("23503", "posts_slug_unique")),
        isSlug,
      ),
    ).toBe(false);
    expect(isUniqueViolationOn(wrapped(driverError("23505")), isSlug)).toBe(
      false,
    );
  });
});
