import { describe, expect, it } from "vitest";

import {
  standReservationsFromMembers,
  withMembershipReservations,
  withMembershipReservationsBySector,
} from "@/app/lib/reservations/stand-occupancy";

function member(id: number, position: number, releasedAt: Date | null = null) {
  return { position, releasedAt, reservation: { id } };
}

describe("standReservationsFromMembers", () => {
  it("returns the occupying reservations in selection order", () => {
    expect(standReservationsFromMembers([member(2, 1), member(1, 0)])).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("drops a member released by an admin downgrade", () => {
    expect(
      standReservationsFromMembers([member(1, 0), member(2, 1, new Date())]),
    ).toEqual([{ id: 1 }]);
  });

  it("reports an unoccupied stand as empty", () => {
    expect(standReservationsFromMembers([])).toEqual([]);
  });
});

describe("withMembershipReservations", () => {
  it("gives a full table's companion the same reservation as its other half", () => {
    // The bug this guards: the companion has no parent stand_id pointing at
    // it, so through `stands.reservations` it looked free on every map.
    const stands = [
      { id: 10, label: "A", reservationMembers: [member(7, 0)] },
      { id: 11, label: "A", reservationMembers: [member(7, 1)] },
    ];

    const result = withMembershipReservations(stands);

    expect(result.map((stand) => stand.reservations)).toEqual([
      [{ id: 7 }],
      [{ id: 7 }],
    ]);
    // Other stand columns survive the rewrite.
    expect(result[0].label).toBe("A");
    expect(result[0]).not.toHaveProperty("reservationMembers");
  });

  it("leaves a genuinely free stand free", () => {
    expect(
      withMembershipReservations([{ id: 10, reservationMembers: [] }])[0]
        .reservations,
    ).toEqual([]);
  });
});

describe("withMembershipReservationsBySector", () => {
  it("rewrites nested stands and keeps the sector's own fields", () => {
    const sectors = [
      {
        id: 1,
        name: "Sector A",
        stands: [{ id: 10, reservationMembers: [member(7, 0)] }],
      },
    ];

    const [sector] = withMembershipReservationsBySector(sectors);

    expect(sector.name).toBe("Sector A");
    expect(sector.stands[0].reservations).toEqual([{ id: 7 }]);
  });
});
