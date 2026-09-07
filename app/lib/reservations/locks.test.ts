import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { sameIdSet, uniqueSortedIds } from "@/app/lib/reservations/locks";

describe("reservation id helpers", () => {
  it("dedupes, drops invalid ids, and sorts", () => {
    expect(uniqueSortedIds([3, 1, 3, 0, -2, 2, 1.5])).toEqual([1, 2, 3]);
  });

  it("compares sets without regard to source order or duplicates", () => {
    expect(sameIdSet([3, 1], [1, 3, 3])).toBe(true);
    expect(sameIdSet([1, 2], [1, 2, 3])).toBe(false);
  });
});
