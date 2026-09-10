import { describe, expect, it } from "vitest";

import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { getStandReservationSummary } from "./admin-overview-reservations";

function makeInvoice({
  invoiceId,
  reservationId,
  standId = 10,
  memberStandIds,
  releasedStandIds = [],
  status,
  createdAt,
}: {
  invoiceId: number;
  reservationId: number;
  standId?: number;
  /** Stands the aggregate occupies. Omit to model a row with no member rows. */
  memberStandIds?: number[];
  releasedStandIds?: number[];
  status:
    | "pending"
    | "verification_payment"
    | "accepted"
    | "rejected"
    | "cancelled"
    | "released";
  createdAt: string;
}) {
  return {
    id: invoiceId,
    createdAt: new Date(createdAt),
    reservation: {
      id: reservationId,
      standId,
      status,
      createdAt: new Date(createdAt),
      members: memberStandIds?.map((id, index) => ({
        standId: id,
        position: index,
        releasedAt: releasedStandIds.includes(id) ? new Date(createdAt) : null,
        stand: { id },
      })),
    },
  } as unknown as InvoiceWithParticipants;
}

describe("getStandReservationSummary", () => {
  it.each(["rejected", "cancelled", "released"] as const)(
    "treats a stand with only %s reservations as having no active reservation",
    (status) => {
      const cancelled = makeInvoice({
        invoiceId: 1,
        reservationId: 100,
        status,
        createdAt: "2026-06-01T12:00:00.000Z",
      });

      expect(getStandReservationSummary([cancelled], 10)).toEqual({
        activeInvoice: null,
        cancelledInvoices: [cancelled],
      });
    },
  );

  it("selects a new active reservation even when an older cancellation comes first", () => {
    const cancelled = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      status: "rejected",
      createdAt: "2026-06-01T12:00:00.000Z",
    });
    const active = makeInvoice({
      invoiceId: 2,
      reservationId: 101,
      status: "pending",
      createdAt: "2026-06-02T12:00:00.000Z",
    });

    expect(getStandReservationSummary([cancelled, active], 10)).toEqual({
      activeInvoice: active,
      cancelledInvoices: [cancelled],
    });
  });

  it("uses the newest reservation and orders cancellation history newest first", () => {
    const olderActive = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      status: "pending",
      createdAt: "2026-06-01T12:00:00.000Z",
    });
    const olderCancelled = makeInvoice({
      invoiceId: 2,
      reservationId: 101,
      status: "rejected",
      createdAt: "2026-06-02T12:00:00.000Z",
    });
    const newerCancelled = makeInvoice({
      invoiceId: 3,
      reservationId: 102,
      status: "rejected",
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    const newerActive = makeInvoice({
      invoiceId: 4,
      reservationId: 103,
      status: "verification_payment",
      createdAt: "2026-06-04T12:00:00.000Z",
    });

    const summary = getStandReservationSummary(
      [olderActive, olderCancelled, newerCancelled, newerActive],
      10,
    );

    expect(summary.activeInvoice).toBe(newerActive);
    expect(summary.cancelledInvoices).toEqual([newerCancelled, olderCancelled]);
  });

  it("ignores reservations assigned to another stand", () => {
    const otherStand = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      standId: 11,
      status: "pending",
      createdAt: "2026-06-01T12:00:00.000Z",
    });

    expect(getStandReservationSummary([otherStand], 10)).toEqual({
      activeInvoice: null,
      cancelledInvoices: [],
    });
  });
});

describe("full tables", () => {
  it("attaches the reservation to both halves, not just the one picked first", () => {
    // The defect this file exists to prevent: `reservation.standId` names only
    // the originally selected stand, so the second half of every full table
    // rendered as an empty square — no colour, no tooltip, no drawer — while
    // the reservation holding it sat one square over.
    const fullTable = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      standId: 10,
      memberStandIds: [10, 11],
      status: "accepted",
      createdAt: "2026-06-01T12:00:00.000Z",
    });

    expect(getStandReservationSummary([fullTable], 10).activeInvoice).toBe(
      fullTable,
    );
    expect(getStandReservationSummary([fullTable], 11).activeInvoice).toBe(
      fullTable,
    );
  });

  it("lets go of a half an admin downgraded away", () => {
    const downgraded = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      standId: 10,
      memberStandIds: [10, 11],
      releasedStandIds: [11],
      status: "accepted",
      createdAt: "2026-06-01T12:00:00.000Z",
    });

    expect(getStandReservationSummary([downgraded], 10).activeInvoice).toBe(
      downgraded,
    );
    expect(getStandReservationSummary([downgraded], 11)).toEqual({
      activeInvoice: null,
      cancelledInvoices: [],
    });
  });

  it("claims no stand it does not occupy", () => {
    const fullTable = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      standId: 10,
      memberStandIds: [10, 11],
      status: "accepted",
      createdAt: "2026-06-01T12:00:00.000Z",
    });

    expect(getStandReservationSummary([fullTable], 12)).toEqual({
      activeInvoice: null,
      cancelledInvoices: [],
    });
  });

  it("falls back to the root stand when a reservation has no member rows", () => {
    const legacy = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      standId: 10,
      status: "accepted",
      createdAt: "2026-06-01T12:00:00.000Z",
    });

    expect(getStandReservationSummary([legacy], 10).activeInvoice).toBe(legacy);
    expect(getStandReservationSummary([legacy], 11).activeInvoice).toBeNull();
  });
});
