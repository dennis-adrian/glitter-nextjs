import { describe, expect, it } from "vitest";

import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { getStandReservationSummary } from "./admin-overview-reservations";

function makeInvoice({
  invoiceId,
  reservationId,
  standId = 10,
  status,
  createdAt,
}: {
  invoiceId: number;
  reservationId: number;
  standId?: number;
  status: "pending" | "verification_payment" | "accepted" | "rejected";
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
    },
  } as unknown as InvoiceWithParticipants;
}

describe("getStandReservationSummary", () => {
  it("treats a stand with only cancelled reservations as having no active reservation", () => {
    const cancelled = makeInvoice({
      invoiceId: 1,
      reservationId: 100,
      status: "rejected",
      createdAt: "2026-06-01T12:00:00.000Z",
    });

    expect(getStandReservationSummary([cancelled], 10)).toEqual({
      activeInvoice: null,
      cancelledInvoices: [cancelled],
    });
  });

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
