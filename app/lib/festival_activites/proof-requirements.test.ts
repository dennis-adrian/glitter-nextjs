import { describe, expect, it } from "vitest";
import {
  getProofTypeRequirementError,
  getProofTypeRequirementHint,
  getRequiredProofTypes,
} from "@/app/lib/festival_activites/proof-requirements";
import {
  STAND_ACTIVITY_FILTERS,
  isStandActivityFilter,
} from "@/app/lib/maps/stand-filters";
import { festivalActivityTypeEnum } from "@/db/schema";

describe("proof requirements", () => {
  it("requires material for exactly the types the map draws a badge for", () => {
    for (const type of festivalActivityTypeEnum.enumValues) {
      const required = getRequiredProofTypes(type);
      if (isStandActivityFilter(type)) {
        expect(required?.length, type).toBeGreaterThan(0);
        expect(getProofTypeRequirementError(type, null), type).not.toBeNull();
      } else {
        expect(required, type).toBeNull();
        expect(getProofTypeRequirementError(type, null), type).toBeNull();
        expect(getProofTypeRequirementHint(type), type).toBeNull();
      }
    }
    expect(
      STAND_ACTIVITY_FILTERS.every((type) => getRequiredProofTypes(type)),
    ).toBe(true);
  });

  it.each([
    ["coupon_book", ["text", "both"]],
    ["stamp_passport", ["image"]],
    ["sticker_hunt", ["image"]],
    ["festival_sticker", ["image"]],
  ] as const)("accepts only the material %s can collect", (type, allowed) => {
    expect(getRequiredProofTypes(type)).toEqual(allowed);
    for (const proofType of ["image", "text", "both"] as const) {
      const error = getProofTypeRequirementError(type, proofType);
      if ((allowed as readonly string[]).includes(proofType))
        expect(error).toBeNull();
      else expect(error).toMatch(/^Este tipo de actividad necesita/);
    }
  });

  it("names the material and why it matters", () => {
    expect(getProofTypeRequirementError("stamp_passport", null)).toBe(
      "Elegí «Imagen»: el mapa solo marca a quienes tienen el diseño del sello aprobado.",
    );
    expect(getProofTypeRequirementError("coupon_book", "image")).toBe(
      "Este tipo de actividad necesita «Texto» o «Imagen y texto» como material: el mapa solo marca a quienes tienen la promoción aprobada.",
    );
    expect(getProofTypeRequirementHint("sticker_hunt")).toBe(
      "Usá «Imagen». El mapa solo marca a quienes tienen el diseño del sticker aprobado.",
    );
  });
});
