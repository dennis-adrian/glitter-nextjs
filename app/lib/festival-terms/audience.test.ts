import { describe, expect, it } from "vitest";

import { filterSectionsForAudience } from "@/app/lib/festival-terms/audience";
import type { FestivalTermsSection } from "@/app/lib/festival-terms/definitions";

function section(
  overrides: Partial<FestivalTermsSection> & {
    audienceCategories?: string[];
    audienceFestivalTypes?: string[];
  },
): FestivalTermsSection {
  return {
    id: 1,
    versionId: 1,
    sortOrder: 0,
    kind: "rich_text",
    layout: "plain",
    title: "Test",
    bodyJson: [],
    bodyHtml: "<p>Test</p>",
    audienceCategories: [],
    audienceFestivalTypes: [],
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("filterSectionsForAudience", () => {
  it("keeps untagged sections for every category and festival type", () => {
    const sections = [section({ id: 1 })];
    expect(
      filterSectionsForAudience(sections, "illustration", "glitter"),
    ).toHaveLength(1);
    expect(
      filterSectionsForAudience(sections, "gastronomy", "festicker"),
    ).toHaveLength(1);
  });

  it("hides category-tagged sections from other categories", () => {
    const sections = [
      section({ id: 1, audienceCategories: ["gastronomy"] }),
    ];
    expect(
      filterSectionsForAudience(sections, "illustration", "glitter"),
    ).toHaveLength(0);
    expect(
      filterSectionsForAudience(sections, "gastronomy", "glitter"),
    ).toHaveLength(1);
  });

  it("maps new_artist to illustration", () => {
    const sections = [
      section({ id: 1, audienceCategories: ["illustration"] }),
    ];
    expect(
      filterSectionsForAudience(sections, "new_artist", "glitter"),
    ).toHaveLength(1);
  });

  it("filters by festival type independently of category", () => {
    const sections = [
      section({ id: 1, audienceFestivalTypes: ["festicker"] }),
    ];
    expect(
      filterSectionsForAudience(sections, "entrepreneurship", "glitter"),
    ).toHaveLength(0);
    expect(
      filterSectionsForAudience(sections, "entrepreneurship", "festicker"),
    ).toHaveLength(1);
  });

  it("requires both audience dimensions to match when both are set", () => {
    const sections = [
      section({
        id: 1,
        audienceCategories: ["entrepreneurship"],
        audienceFestivalTypes: ["festicker"],
      }),
    ];
    expect(
      filterSectionsForAudience(sections, "entrepreneurship", "glitter"),
    ).toHaveLength(0);
    expect(
      filterSectionsForAudience(sections, "illustration", "festicker"),
    ).toHaveLength(0);
    expect(
      filterSectionsForAudience(sections, "entrepreneurship", "festicker"),
    ).toHaveLength(1);
  });
});
