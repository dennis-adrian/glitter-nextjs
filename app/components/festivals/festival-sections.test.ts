import { describe, expect, it } from "vitest";

import { festivalSectionHref, visibleFestivalSections } from "@/app/components/festivals/festival-sections";

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

  it("offers Voluntarios to admins and festival admins alike", () => {
    const volunteers = visibleFestivalSections("published").find(
      (section) => section.key === "volunteers",
    );
    expect(volunteers).toMatchObject({ group: "participants", path: "volunteers" });
    expect(festivalSectionHref(9, volunteers!)).toBe("/dashboard/festivals/9/volunteers");
    expect(keys(visibleFestivalSections("published", { isAdmin: true }))).toContain("volunteers");
  });

  it("hides Credenciales unless its flag is passed as enabled", () => {
    expect(keys(visibleFestivalSections("published", { isAdmin: true }))).not.toContain("credentials");
    expect(
      keys(visibleFestivalSections("published", { flags: { festival_credentials: false } })),
    ).not.toContain("credentials");
    const visible = keys(
      visibleFestivalSections("published", { flags: { festival_credentials: true } }),
    );
    expect(visible).toContain("credentials");
    // Right after Voluntarios, in the participants group.
    expect(visible.indexOf("credentials")).toBe(visible.indexOf("volunteers") + 1);
    const credentials = visibleFestivalSections("published", {
      flags: { festival_credentials: true },
    }).find((section) => section.key === "credentials");
    expect(credentials).toMatchObject({ group: "participants" });
    expect(festivalSectionHref(9, credentials!)).toBe("/dashboard/festivals/9/credentials");
  });
});
