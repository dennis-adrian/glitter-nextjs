import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PublicMapStandCard from "@/app/components/maps/public/public-map-drawer";
import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

afterEach(cleanup);

function stand(
  id: number,
  { products = [] }: { products?: string[] } = {},
): StandWithReservationsWithParticipants {
  return {
    id,
    label: "A",
    standNumber: id,
    standCategory: "illustration",
    standSubcategories: products.map((label, index) => ({
      subcategoryId: index,
      subcategory: { label },
    })),
    reservations: [
      {
        status: "accepted",
        participants: [
          {
            id: 1,
            user: {
              id: 42,
              displayName: "Pandora",
              imageUrl: null,
              category: "illustration",
              userSocials: [],
            },
          },
        ],
        externalParticipants: [],
      },
    ],
  } as unknown as StandWithReservationsWithParticipants;
}

describe("PublicMapStandCard", () => {
  it("names a lone stand in the singular", () => {
    render(
      <PublicMapStandCard stand={stand(7)} open sectorName="Lobby" />,
    );

    expect(screen.getByText(/^Stand A7/)).toBeTruthy();
  });

  it("names both halves of a joint group", () => {
    const stands = [stand(7), stand(8)];
    render(
      <PublicMapStandCard
        stand={stands[0]}
        open
        sectorName="Lobby"
        groupStands={stands}
      />,
    );

    expect(screen.getByText(/^Stands A7 - A8/)).toBeTruthy();
    // The badge carries the joined label too
    expect(screen.getAllByText("A7 - A8").length).toBeGreaterThan(0);
  });

  it("orders double-digit stands numerically", () => {
    // Map order puts A10 first; the card should still read A9 - A10
    const stands = [stand(10), stand(9)];
    render(
      <PublicMapStandCard stand={stands[0]} open groupStands={stands} />,
    );

    expect(screen.getByText(/^Stands A9 - A10/)).toBeTruthy();
  });

  it("shows the products of every stand in the group", () => {
    const stands = [
      stand(7, { products: ["Stickers", "Prints"] }),
      stand(8, { products: ["Prints", "Pins"] }),
    ];
    render(
      <PublicMapStandCard stand={stands[0]} open groupStands={stands} />,
    );

    expect(screen.getByText("Stickers")).toBeTruthy();
    expect(screen.getByText("Pins")).toBeTruthy();
    // Shared products are not repeated
    expect(screen.getAllByText("Prints")).toHaveLength(1);
  });

  it("falls back to the tapped stand when no group is passed", () => {
    render(
      <PublicMapStandCard
        stand={stand(7, { products: ["Stickers"] })}
        open
        groupStands={[]}
      />,
    );

    expect(screen.getByText(/^Stand A7/)).toBeTruthy();
    expect(screen.getByText("Stickers")).toBeTruthy();
  });
});
