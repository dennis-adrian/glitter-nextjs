import { describe, expect, it } from "vitest";

import {
  buildParticipantSchedule,
  buildPendingItems,
  buildSteps,
  daysUntil,
  resolveHubStatus,
  type HubLinks,
} from "@/app/lib/participations/hub-status";

const links: HubLinks = {
  terms: "/terms",
  reserve: "/reserve",
  invoices: "/invoices",
  products: "/products",
  team: "/team",
};

describe("resolveHubStatus", () => {
  it("keeps the portal card's state when stands are left", () => {
    expect(
      resolveHubStatus({
        cardStatus: "approved_enrollment",
        availableStands: 4,
        reservationsOpen: true,
      }),
    ).toBe("approved_enrollment");
  });

  it("says the category ran out instead of sending someone to an empty map", () => {
    expect(
      resolveHubStatus({
        cardStatus: "approved_enrollment",
        availableStands: 0,
        reservationsOpen: true,
      }),
    ).toBe("no_stands_available");
  });

  it("tells someone not yet enrolled too, once reservations are open", () => {
    expect(
      resolveHubStatus({
        cardStatus: "pending_enrollment",
        availableStands: 0,
        reservationsOpen: true,
      }),
    ).toBe("no_stands_available");
    expect(
      resolveHubStatus({
        cardStatus: "pending_enrollment",
        availableStands: 0,
        reservationsOpen: false,
      }),
    ).toBe("pending_enrollment");
  });

  it("never overrides a reservation that already exists", () => {
    for (const cardStatus of [
      "pending_payment",
      "pending_payment_approval",
      "confirmed_reservation",
    ] as const) {
      expect(
        resolveHubStatus({
          cardStatus,
          availableStands: 0,
          reservationsOpen: true,
        }),
      ).toBe(cardStatus);
    }
  });
});

describe("buildSteps", () => {
  it("gives most categories enrollment, reservation and payment", () => {
    expect(
      buildSteps({
        isGastronomy: false,
        enrollmentStatus: null,
        hasReservation: false,
        isConfirmed: false,
      }).map((step) => step.label),
    ).toEqual(["Inscripción", "Reserva", "Pago"]);
  });

  it("adds the team's review for gastronomy only", () => {
    expect(
      buildSteps({
        isGastronomy: true,
        enrollmentStatus: "pending",
        hasReservation: false,
        isConfirmed: false,
      }),
    ).toEqual([
      { key: "enrollment", label: "Inscripción", done: true },
      { key: "review", label: "Revisión", done: false },
      { key: "reservation", label: "Reserva", done: false },
      { key: "payment", label: "Pago", done: false },
    ]);
  });

  it("marks only what is done", () => {
    expect(
      buildSteps({
        isGastronomy: false,
        enrollmentStatus: "accepted",
        hasReservation: true,
        isConfirmed: false,
      }).map((step) => step.done),
    ).toEqual([true, true, false]);
  });

  it("does not count a rejected enrollment as enrolled", () => {
    expect(
      buildSteps({
        isGastronomy: true,
        enrollmentStatus: "rejected",
        hasReservation: false,
        isConfirmed: false,
      })[0].done,
    ).toBe(false);
  });
});

describe("buildPendingItems", () => {
  const base = {
    isGastronomy: false,
    shouldSubmitProducts: false,
    teamCount: 0,
    links,
  };

  it("starts with enrolling, linked to the terms", () => {
    expect(
      buildPendingItems({
        ...base,
        status: "pending_enrollment",
        enrollmentStatus: null,
        hasReservation: false,
        isConfirmed: false,
      }),
    ).toEqual([
      {
        key: "enrollment",
        label: "Inscribirte al festival",
        done: false,
        href: "/terms",
      },
    ]);
  });

  it("shows gastronomy's review as something to wait for, not do", () => {
    const items = buildPendingItems({
      ...base,
      isGastronomy: true,
      status: "enrollment_pending_approval",
      enrollmentStatus: "pending",
      hasReservation: false,
      isConfirmed: false,
    });

    expect(items.map((item) => item.key)).toEqual(["enrollment", "review"]);
    expect(items[1]).toMatchObject({ done: false, meta: "en curso" });
    expect(items[1].href).toBeUndefined();
  });

  it("links reserving only once it can be done", () => {
    const open = buildPendingItems({
      ...base,
      status: "approved_enrollment",
      enrollmentStatus: "accepted",
      hasReservation: false,
      isConfirmed: false,
    });
    const waiting = buildPendingItems({
      ...base,
      status: "waiting_for_reservations",
      enrollmentStatus: "accepted",
      hasReservation: false,
      isConfirmed: false,
    });

    expect(open.find((item) => item.key === "reservation")?.href).toBe(
      "/reserve",
    );
    expect(waiting.find((item) => item.key === "reservation")).toMatchObject({
      href: undefined,
      meta: "aún no abre",
    });
  });

  it("asks for payment and products once there is a reservation", () => {
    const items = buildPendingItems({
      ...base,
      shouldSubmitProducts: true,
      status: "pending_payment",
      enrollmentStatus: "accepted",
      hasReservation: true,
      isConfirmed: false,
    });

    expect(items.map((item) => [item.key, item.done])).toEqual([
      ["enrollment", true],
      ["reservation", true],
      ["payment", false],
      ["products", false],
    ]);
  });

  it("adds the team once confirmed, done when someone is on it", () => {
    const empty = buildPendingItems({
      ...base,
      status: "confirmed_reservation",
      enrollmentStatus: "accepted",
      hasReservation: true,
      isConfirmed: true,
    });
    const staffed = buildPendingItems({
      ...base,
      teamCount: 2,
      status: "confirmed_reservation",
      enrollmentStatus: "accepted",
      hasReservation: true,
      isConfirmed: true,
    });

    expect(empty.at(-1)).toMatchObject({
      key: "team",
      done: false,
      meta: "0 de 4",
    });
    expect(staffed.at(-1)).toMatchObject({ key: "team", done: true });
  });

  it("has nothing to offer after a rejected enrollment", () => {
    expect(
      buildPendingItems({
        ...base,
        isGastronomy: true,
        status: "rejected_enrollment",
        enrollmentStatus: "rejected",
        hasReservation: false,
        isConfirmed: false,
      }),
    ).toEqual([]);
  });
});

describe("buildParticipantSchedule", () => {
  const day1 = {
    startDate: new Date("2026-11-14T14:00:00Z"),
    endDate: new Date("2026-11-14T23:00:00Z"),
  };
  const day2 = {
    startDate: new Date("2026-11-15T15:00:00Z"),
    endDate: new Date("2026-11-15T22:00:00Z"),
  };

  it("derives each day's times from that day's own hours", () => {
    const [first, second] = buildParticipantSchedule([day2, day1]);

    expect(first.day).toBe(1);
    expect(first.entries[0]).toMatchObject({
      label: "Ingreso de participantes y armado",
      startsAt: new Date("2026-11-14T13:00:00Z"),
      highlight: true,
    });
    expect(second.entries[0].startsAt).toEqual(
      new Date("2026-11-15T14:00:00Z"),
    );
  });

  it("closes the venue half an hour after doors, except the last day's teardown", () => {
    const [first, last] = buildParticipantSchedule([day1, day2]);

    expect(first.entries.at(-1)).toMatchObject({
      label: "Cierre del recinto",
      startsAt: new Date("2026-11-14T23:30:00Z"),
    });
    expect(last.entries.map((entry) => entry.label)).toContain("Desarmado");
    expect(last.entries.at(-1)?.startsAt).toEqual(
      new Date("2026-11-15T22:45:00Z"),
    );
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-10-24T12:00:00Z");

  it("counts whole days ahead", () => {
    expect(daysUntil(new Date("2026-11-14T14:00:00Z"), now)).toBe(22);
  });

  it("is null once the festival has started", () => {
    expect(daysUntil(new Date("2026-10-20T14:00:00Z"), now)).toBeNull();
    expect(daysUntil(undefined, now)).toBeNull();
  });
});
