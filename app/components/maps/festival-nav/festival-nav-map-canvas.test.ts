import { describe, expect, it } from "vitest";

import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { getNavStandColors } from "@/app/components/maps/festival-nav/festival-nav-map-canvas";
import { getPublicStandColors } from "@/app/components/maps/map-utils";

describe("getNavStandColors", () => {
  it("uses the status palette for occupied activity participants", () => {
    const stand = {
      status: "confirmed",
      reservations: [
        {
          status: "accepted",
          participants: [{ user: { id: 17 } }],
          externalParticipants: [],
        },
      ],
    } as unknown as StandWithReservationsWithParticipants;

    expect(getNavStandColors(stand)).toEqual(getPublicStandColors("confirmed"));
  });
});
