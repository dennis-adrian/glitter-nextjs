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
   * individual price sat in the header badge, so the two never read as a choice
   * between two ways of taking the same space.
   */
  it("names both rates together when the space can be shared", () => {
    renderCard();

    expect(screen.getByText("Espacio individual")).toBeTruthy();
    expect(screen.getByText("Espacio compartido")).toBeTruthy();
    expect(screen.getByText("Bs. 350")).toBeTruthy();
    expect(screen.getByText("Bs. 380")).toBeTruthy();
    // The band becomes an entry price so sectors stay comparable while scrolling.
    expect(screen.getByText("Desde")).toBeTruthy();
  });

  it("says the shared price covers the reservation, not one person", () => {
    renderCard();

    expect(
      screen.getByText(/Total de la reserva, no por persona/),
    ).toBeTruthy();
  });

  it("shows a single price with no rate list when nothing is shareable", () => {
    renderCard({ sharedPrice: null });

    expect(screen.queryByText("Espacio compartido")).toBeNull();
    expect(screen.queryByText("Desde")).toBeNull();
    expect(screen.getByText("350")).toBeTruthy();
  });

  it("ignores a stored shared price outside illustration", () => {
    // Only illustration sells a shared space; every other category must not
    // advertise one even if the column happens to carry a value.
    renderCard({ sharedPrice: 380 }, "entrepreneurship");

    expect(screen.queryByText("Espacio compartido")).toBeNull();
  });
});
