import { describe, expect, it } from "vitest";

import {
  withMembershipReservations,
  withMembershipReservationsBySector,
} from "@/app/lib/reservations/stand-occupancy";

function reservation(id: number) {
  return { id, status: "accepted" as const };
}

function member(
  reservationId: number,
  position = 0,
  releasedAt: Date | null = null,
) {
  return { reservationId, position, releasedAt };
}

describe("withMembershipReservations", () => {
  it("gives a full table's companion the reservation held by its other half", () => {
    // The bug this guards: the companion has no parent stand_id pointing at it,
    // so its own `reservations` array comes back empty and it looked free.
    const stands = [
      {
        id: 10,
        reservations: [reservation(7)],
        reservationMembers: [member(7, 0)],
      },
      { id: 11, reservations: [], reservationMembers: [member(7, 1)] },
    ];

    const result = withMembershipReservations(stands);

    expect(result.map((stand) => stand.reservations.map((r) => r.id))).toEqual([
      [7],
      [7],
    ]);
  });

  it("orders a stand's reservations by member position", () => {
    const stands = [
      {
        id: 10,
        reservations: [reservation(2), reservation(1)],
        reservationMembers: [member(2, 1), member(1, 0)],
      },
    ];

    expect(
      withMembershipReservations(stands)[0].reservations.map((r) => r.id),
    ).toEqual([1, 2]);
  });

  it("drops a member released by an admin downgrade", () => {
    const stands = [
      {
        id: 10,
        reservations: [reservation(7)],
        reservationMembers: [member(7, 0)],
      },
      {
        id: 11,
        reservations: [],
        reservationMembers: [member(7, 1, new Date())],
      },
    ];

    const result = withMembershipReservations(stands);

    expect(result[0].reservations.map((r) => r.id)).toEqual([7]);
    // The released companion is free again.
    expect(result[1].reservations).toEqual([]);
  });

  it("leaves a genuinely free stand free", () => {
    expect(
      withMembershipReservations([
        { id: 10, reservations: [], reservationMembers: [] },
      ])[0].reservations,
    ).toEqual([]);
  });

  it("keeps the stand's own rows when membership is not backfilled", () => {
    // A database still on the pre-0264 shape has no member rows; the stand must
    // not appear free just because membership is missing.
    const stands = [
      { id: 10, reservations: [reservation(7)], reservationMembers: [] },
    ];

    expect(
      withMembershipReservations(stands)[0].reservations.map((r) => r.id),
    ).toEqual([7]);
  });

  it("preserves the stand's other columns", () => {
    const stands = [
      {
        id: 10,
        label: "A",
        reservations: [reservation(7)],
        reservationMembers: [member(7, 0)],
      },
    ];

    expect(withMembershipReservations(stands)[0].label).toBe("A");
  });
});

describe("withMembershipReservationsBySector", () => {
  it("resolves a companion whose half was fetched under another sector", () => {
    // The index spans every sector, so resolution never depends on which
    // sector a reservation's primary half happened to land in.
    const sectors = [
      {
        id: 1,
        name: "A",
        stands: [
          {
            id: 10,
            reservations: [reservation(7)],
            reservationMembers: [member(7, 0)],
          },
        ],
      },
      {
        id: 2,
        name: "B",
        stands: [
          { id: 11, reservations: [], reservationMembers: [member(7, 1)] },
        ],
      },
    ];

    const result = withMembershipReservationsBySector(sectors);

    expect(result[1].name).toBe("B");
    expect(result[1].stands[0].reservations.map((r) => r.id)).toEqual([7]);
  });
});
