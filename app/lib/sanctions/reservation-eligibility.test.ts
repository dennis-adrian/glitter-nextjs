import { describe, expect, it } from "vitest";

import { resolveReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility-logic";

const now = new Date("2026-07-23T12:00:00.000Z");

describe("resolveReservationEligibility", () => {
  it("allows users with no applicable blocking sanctions", () => {
    expect(resolveReservationEligibility([], now)).toEqual({ eligible: true });
    expect(
      resolveReservationEligibility(
        [
          {
            id: 1,
            type: "warning",
            status: "active",
            startsAt: new Date("2026-07-01T00:00:00.000Z"),
            endsAt: null,
            reservationEligibleAt: null,
          },
        ],
        now,
      ),
    ).toEqual({ eligible: true });
  });

  it("blocks bans ahead of reservation delays", () => {
    const result = resolveReservationEligibility(
      [
        {
          id: 10,
          type: "reservation_delay",
          status: "active",
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
          endsAt: null,
          reservationEligibleAt: new Date("2026-07-24T12:00:00.000Z"),
        },
        {
          id: 11,
          type: "ban",
          status: "active",
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
          endsAt: null,
          reservationEligibleAt: null,
        },
      ],
      now,
    );

    expect(result).toMatchObject({
      eligible: false,
      reason: "ban",
      sanctionIds: [10, 11],
    });
  });

  it("uses the latest reservationEligibleAt among delays", () => {
    const result = resolveReservationEligibility(
      [
        {
          id: 1,
          type: "reservation_delay",
          status: "active",
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
          endsAt: null,
          reservationEligibleAt: new Date("2026-07-24T10:00:00.000Z"),
        },
        {
          id: 2,
          type: "reservation_delay",
          status: "scheduled",
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
          endsAt: null,
          reservationEligibleAt: new Date("2026-07-25T18:00:00.000Z"),
        },
      ],
      now,
    );

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reason).toBe("reservation_delay");
    expect(result.eligibleAt?.toISOString()).toBe("2026-07-25T18:00:00.000Z");
    expect(result.sanctionIds).toEqual([1, 2]);
    expect(result.message).toContain("Podrás reservar a partir del");
  });

  it("ignores future starts, expired ends, and elapsed delays", () => {
    expect(
      resolveReservationEligibility(
        [
          {
            id: 1,
            type: "ban",
            status: "active",
            startsAt: new Date("2026-07-24T00:00:00.000Z"),
            endsAt: null,
            reservationEligibleAt: null,
          },
          {
            id: 2,
            type: "ban",
            status: "active",
            startsAt: new Date("2026-07-01T00:00:00.000Z"),
            endsAt: new Date("2026-07-22T00:00:00.000Z"),
            reservationEligibleAt: null,
          },
          {
            id: 3,
            type: "reservation_delay",
            status: "active",
            startsAt: new Date("2026-07-01T00:00:00.000Z"),
            endsAt: null,
            reservationEligibleAt: new Date("2026-07-20T00:00:00.000Z"),
          },
        ],
        now,
      ),
    ).toEqual({ eligible: true });
  });
});
