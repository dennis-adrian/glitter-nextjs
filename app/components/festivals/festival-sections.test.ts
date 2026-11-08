import { describe, expect, it } from "vitest";

import { visibleFestivalSections } from "@/app/components/festivals/festival-sections";

const keys = (sections: { key: string }[]) => sections.map((section) => section.key);

describe("visibleFestivalSections", () => {
  it("shows Finanzas to admins only", () => {
    expect(keys(visibleFestivalSections("published", { isAdmin: true }))).toContain("finance");
    expect(keys(visibleFestivalSections("published", { isAdmin: false }))).not.toContain("finance");
  });

  it("hides admin-only sections when the caller does not say", () => {
    expect(keys(visibleFestivalSections("active"))).not.toContain("finance");
  });

  it("keeps door check-in to active festivals", () => {
    expect(keys(visibleFestivalSections("published", { isAdmin: true }))).not.toContain("verification");
    expect(keys(visibleFestivalSections("active", { isAdmin: true }))).toContain("verification");
  });
});
