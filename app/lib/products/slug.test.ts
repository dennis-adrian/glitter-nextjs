import { describe, expect, it } from "vitest";

import {
  allocateUniqueSlugFromUsedSet,
  slugifyName,
} from "@/app/lib/products/slug";

describe("slugifyName", () => {
  it("lowercases and hyphenates a plain title", () => {
    expect(slugifyName("Cómo armar tu stand")).toBe("como-armar-tu-stand");
  });

  it("strips Spanish accents rather than dropping the letters", () => {
    expect(slugifyName("Diseño gráfico e ilustración")).toBe(
      "diseno-grafico-e-ilustracion",
    );
    expect(slugifyName("ÁÉÍÓÚ áéíóú Ññ Üü")).toBe("aeiou-aeiou-nn-uu");
  });

  it("collapses runs of punctuation and whitespace into one hyphen", () => {
    expect(slugifyName("Tips   &   trucos!!!")).toBe("tips-trucos");
    expect(slugifyName("a---b")).toBe("a-b");
  });

  it("trims leading and trailing separators", () => {
    expect(slugifyName("  ¡Hola!  ")).toBe("hola");
    expect(slugifyName("---borde---")).toBe("borde");
  });

  it("keeps digits and non-Latin letters", () => {
    expect(slugifyName("Top 10 stands")).toBe("top-10-stands");
    expect(slugifyName("Καλημέρα")).toBe("καλημερα");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugifyName("")).toBe("");
    expect(slugifyName("!!!")).toBe("");
    expect(slugifyName("   ")).toBe("");
  });

  it("caps the slug at 120 characters", () => {
    expect(slugifyName("a".repeat(200))).toHaveLength(120);
  });
});

describe("allocateUniqueSlugFromUsedSet", () => {
  it("hands back the base slug when it is free, and reserves it", () => {
    const used = new Set<string>();

    expect(allocateUniqueSlugFromUsedSet(used, "stand", 1)).toBe("stand");
    expect(used.has("stand")).toBe(true);
  });

  it("suffixes -2, -3, … on collision", () => {
    const used = new Set<string>();

    expect(allocateUniqueSlugFromUsedSet(used, "stand", 1)).toBe("stand");
    expect(allocateUniqueSlugFromUsedSet(used, "stand", 2)).toBe("stand-2");
    expect(allocateUniqueSlugFromUsedSet(used, "stand", 3)).toBe("stand-3");
  });

  it("falls back to the row id when the base is empty", () => {
    expect(allocateUniqueSlugFromUsedSet(new Set(), "   ", 42)).toBe(
      "product-42",
    );
  });
});
