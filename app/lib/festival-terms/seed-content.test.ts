import { describe, expect, it } from "vitest";

import { buildInitialFestivalTermsSections } from "@/app/lib/festival-terms/seed-content";

describe("initial festival terms seed", () => {
  it("includes a schedule slot and audience-tagged addenda", () => {
    const sections = buildInitialFestivalTermsSections();
    expect(sections.filter((section) => section.kind === "schedule")).toHaveLength(
      1,
    );
    expect(
      sections.some(
        (section) =>
          section.audienceCategories.includes("gastronomy") &&
          section.title?.includes("2.1"),
      ),
    ).toBe(true);
    expect(
      sections.some((section) =>
        section.audienceFestivalTypes.includes("festicker"),
      ),
    ).toBe(true);
    expect(
      sections.some(
        (section) =>
          section.layout === "card" &&
          section.title?.toLowerCase().includes("comunidad"),
      ),
    ).toBe(true);
  });

  it("gives every rich_text section a non-empty trimmed title", () => {
    const sections = buildInitialFestivalTermsSections();
    const richText = sections.filter((section) => section.kind === "rich_text");
    expect(richText.length).toBeGreaterThan(0);
    for (const section of richText) {
      expect(section.title?.trim().length).toBeGreaterThan(0);
    }
    expect(
      richText.some((section) =>
        section.title?.includes("Ocupación del stand con stickers"),
      ),
    ).toBe(true);
    expect(
      richText.some((section) =>
        section.title?.includes("Donación de stickers para el Stand de Trueque"),
      ),
    ).toBe(true);
  });
});
