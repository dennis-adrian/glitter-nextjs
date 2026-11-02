import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const unstableCacheMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  unstable_cache: unstableCacheMock,
  revalidateTag: revalidateTagMock,
}));

import {
  expireSharedCache,
  reviveTimestamps,
  sharedCache,
} from "@/app/lib/cache/shared";
import { festivals } from "@/db/schema";

beforeEach(() => {
  unstableCacheMock.mockReset();
  revalidateTagMock.mockReset();
});

describe("sharedCache", () => {
  it("reads through unstable_cache with the tags and the lifetime", async () => {
    const fn = vi.fn(async (key: string) => `value for ${key}`);
    unstableCacheMock.mockImplementation((inner) => inner);

    const read = sharedCache(fn, "thing", {
      tags: ["festivals"],
      revalidate: 60,
    });
    await expect(read("a")).resolves.toBe("value for a");

    expect(unstableCacheMock).toHaveBeenCalledWith(fn, ["thing"], {
      tags: ["festivals"],
      revalidate: 60,
    });
  });

  it("calls the function directly where no Next cache is running", async () => {
    unstableCacheMock.mockImplementation(() => async () => {
      throw new Error("Invariant: incrementalCache missing in unstable_cache");
    });
    const read = sharedCache(async () => 42, "thing", {
      tags: ["festivals"],
      revalidate: 60,
    });

    await expect(read()).resolves.toBe(42);
  });

  it("lets a failed read fail", async () => {
    unstableCacheMock.mockImplementation((inner) => inner);
    const read = sharedCache(
      async () => {
        throw new Error("database down");
      },
      "thing",
      { tags: ["festivals"], revalidate: 60 },
    );

    await expect(read()).rejects.toThrow("database down");
  });

  it("revives what came back from the cache's JSON", async () => {
    const stored = JSON.parse(
      JSON.stringify({ id: 1, startDate: new Date("2026-11-23T01:00:00Z") }),
    );
    unstableCacheMock.mockImplementation(() => async () => stored);
    const read = sharedCache(async () => stored, "festival", {
      tags: ["festivals"],
      revalidate: 60,
      revive: (row) => reviveTimestamps(row, festivals),
    });

    const value = await read();
    expect(value.startDate).toBeInstanceOf(Date);
    expect(value.startDate.toISOString()).toBe("2026-11-23T01:00:00.000Z");
  });
});

describe("reviveTimestamps", () => {
  it("only touches the table's date columns", () => {
    const row = {
      name: "2026-11-23T01:00:00.000Z",
      startDate: "2026-11-23T01:00:00.000Z",
      endDate: new Date("2026-11-25T01:00:00Z"),
    };

    const revived = reviveTimestamps(row, festivals) as Record<string, unknown>;

    expect(revived.name).toBe("2026-11-23T01:00:00.000Z");
    expect(revived.startDate).toBeInstanceOf(Date);
    expect(revived.endDate).toBe(row.endDate);
  });
});

describe("expireSharedCache", () => {
  it("expires each tag at once", () => {
    expireSharedCache("festivals", "feature-flags");

    expect(revalidateTagMock).toHaveBeenCalledWith("festivals", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith("feature-flags", {
      expire: 0,
    });
  });

  it("does nothing outside a request", () => {
    revalidateTagMock.mockImplementation(() => {
      throw new Error("Invariant: static generation store missing in revalidateTag festivals");
    });

    expect(() => expireSharedCache("festivals")).not.toThrow();
  });

  it("does not hide a misuse, such as expiring during a render", () => {
    revalidateTagMock.mockImplementation(() => {
      throw new Error("Route / used revalidateTag during render");
    });

    expect(() => expireSharedCache("festivals")).toThrow("during render");
  });
});
