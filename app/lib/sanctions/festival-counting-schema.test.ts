import { describe, expect, it } from "vitest";

import { updateSanctionFestivalCountingSchema } from "@/app/lib/sanctions/schema";

describe("updateSanctionFestivalCountingSchema", () => {
  it("requires valid identifiers and an audit reason", () => {
    expect(
      updateSanctionFestivalCountingSchema.safeParse({
        sanctionId: 12,
        festivalId: 34,
        countsTowardDuration: false,
        reason: "Festival de prueba que no debe contar",
      }).success,
    ).toBe(true);

    expect(
      updateSanctionFestivalCountingSchema.safeParse({
        sanctionId: 12,
        festivalId: 34,
        countsTowardDuration: true,
        reason: "   ",
      }).success,
    ).toBe(false);
  });
});
