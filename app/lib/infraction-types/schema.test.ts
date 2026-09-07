import { describe, expect, it } from "vitest";

import {
  buildInfractionTypeCode,
  createInfractionTypeSchema,
} from "@/app/lib/infraction-types/schema";

describe("infraction type schema", () => {
  it("generates a stable code from a Spanish label", () => {
    expect(buildInfractionTypeCode("  Daño a la Propiedad  ")).toBe(
      "dano_a_la_propiedad",
    );
  });

  it("requires an administrator-facing description with useful detail", () => {
    const result = createInfractionTypeSchema.safeParse({
      label: "Normas del stand",
      description: "Muy corta",
      severity: "medium",
    });

    expect(result.success).toBe(false);
  });

  it("accepts the approved shape", () => {
    const result = createInfractionTypeSchema.safeParse({
      label: "Normas del stand",
      description:
        "Incluye personas sin credencial o más de dos personas detrás del stand.",
      severity: "medium",
    });

    expect(result.success).toBe(true);
  });
});
