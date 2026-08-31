import { describe, expect, it } from "vitest";

import { deriveEffectiveStandStatus } from "@/app/lib/stands/effective-status";

describe("deriveEffectiveStandStatus", () => {
  it("keeps non-held statuses unchanged", () => {
    expect(
      deriveEffectiveStandStatus("confirmed", 1, new Set([1])),
    ).toBe("confirmed");
  });

  it("reports held when an active hold exists", () => {
    expect(deriveEffectiveStandStatus("held", 3, new Set([3]))).toBe("held");
  });

  it("reports available when a held stand has no active hold", () => {
    expect(deriveEffectiveStandStatus("held", 3, new Set())).toBe("available");
  });
});
