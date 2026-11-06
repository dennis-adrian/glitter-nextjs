import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

vi.mock("server-only", () => ({}));

const selectMock = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: { select: selectMock } }));

import { fetchFeatureFlagRule } from "@/app/lib/feature_flags/data";
import { FEATURE_FLAGS } from "@/app/lib/feature_flags/registry";

describe("fetchFeatureFlagRule", () => {
  beforeEach(() => {
    selectMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("falls back to the registry default when the flag cannot be read", async () => {
    selectMock.mockImplementation(() => {
      throw new Error("database down");
    });

    await expect(fetchFeatureFlagRule("blog")).resolves.toEqual({
      visibility: FEATURE_FLAGS.blog.defaultVisibility,
      targetedUserIds: [],
    });
  });

  it("does not swallow Next's own control-flow errors", async () => {
    selectMock.mockImplementation(() => redirect("/"));

    await expect(fetchFeatureFlagRule("credits")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
});
