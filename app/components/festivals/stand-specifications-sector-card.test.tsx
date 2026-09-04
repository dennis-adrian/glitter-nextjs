// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import StandSpecificationsSectorCard from "@/app/components/festivals/stand-specifications-sector-card";

import type { UserCategory } from "@/app/api/users/definitions";

type StandOverrides = {
  individualPrice: number;
  sharedPrice: number | null;
  standCategory: UserCategory;
};

function sector(overrides: Partial<StandOverrides> = {}) {
  const stand = {
    id: 1,
    standNumber: 1,
    label: "A",
    standCategory: "illustration" as UserCategory,
    individualPrice: 350,
    sharedPrice: 380,
    ...overrides,
  };
  return {
    id: 1,
    name: "Lobby",
    allowedCategories: ["illustration"] as UserCategory[],
    // The card reads only these fields off each stand.
    stands: [stand],
  } as unknown as Parameters<typeof StandSpecificationsSectorCard>[0]["sector"];
}

function renderCard(
  overrides: Partial<StandOverrides> = {},
  category: UserCategory = "illustration",
) {
  return render(
    <StandSpecificationsSectorCard
      sector={sector({ standCategory: category, ...overrides })}
      category={category}
    />,
  );
}

describe("StandSpecificationsSectorCard", () => {
  afterEach(cleanup);

  /**
   * The shared price used to live in a sentence halfway down the card while the
   * individual price sat in the header band, so the two never read as a choice
   * between two ways of taking the same space. Both now close the card in one
   * pricing section.
   */
  it("names both rates together when the space can be shared", () => {
    renderCard();

    expect(screen.getByText("Precios")).toBeTruthy();
    expect(screen.getByText("Espacio individual")).toBeTruthy();
    expect(screen.getByText("Espacio compartido")).toBeTruthy();
    expect(screen.getByText("Bs. 350")).toBeTruthy();
    expect(screen.getByText("Bs. 380")).toBeTruthy();
  });

  it("keeps the header to the sector and its size, with no price", () => {
    renderCard();

    const heading = screen.getByRole("heading", { name: /Lobby/ });
    const band = heading.parentElement!;
    // One stand in the fixture, so the singular has to hold too.
    expect(band.textContent).toContain("1 espacio");
    expect(band.textContent).not.toContain("1 espacios");
    expect(band.textContent).not.toContain("Bs.");
  });

  it("says what the shared rate buys, not just its amount", () => {
    renderCard();

    expect(
      screen.getByText(/Para compartirlo con otro ilustrador/),
    ).toBeTruthy();
  });

  it("shows a single price with no rate list when nothing is shareable", () => {
    renderCard({ sharedPrice: null });

    expect(screen.queryByText("Espacio compartido")).toBeNull();
    expect(screen.queryByText("Precios")).toBeNull();
    expect(screen.getByText("Precio")).toBeTruthy();
    expect(screen.getByText("Bs. 350")).toBeTruthy();
  });

  it("ignores a stored shared price outside illustration", () => {
    // Only illustration sells a shared space; every other category must not
    // advertise one even if the column happens to carry a value.
    renderCard({ sharedPrice: 380 }, "entrepreneurship");

    expect(screen.queryByText("Espacio compartido")).toBeNull();
  });

  /**
   * `new_artist` is a deprecated alias for illustration: a sector stocks
   * illustration stands, never `new_artist` ones, so a card that looked the
   * raw category up found nothing to sell and offered Bs. 0 and no espacios.
   */
  it("prices a new_artist card off the illustration stands", () => {
    renderCard({ standCategory: "illustration" }, "new_artist");

    expect(screen.getByText("Bs. 350")).toBeTruthy();
    expect(screen.queryByText("Bs. 0")).toBeNull();

    const heading = screen.getByRole("heading", { name: /Lobby/ });
    expect(heading.parentElement!.textContent).toContain("1 espacio");
  });
});
