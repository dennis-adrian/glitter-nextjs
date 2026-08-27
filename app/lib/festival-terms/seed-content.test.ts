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
});
