import { describe, expect, it } from "vitest";

import {
  canAcceptInvoiceProof,
  countOutstandingInvoices,
  DisplayPaymentStatus,
  getInvoiceStatusLabel,
  mapPaymentStatusToDisplayPaymentStatus,
} from "@/app/lib/payments/helpers";
import type { InvoiceBase } from "@/app/data/invoices/definitions";
import type { ReservationBase } from "@/app/api/reservations/definitions";

function invoice(status: InvoiceBase["status"]): InvoiceBase {
  return {
    id: 1,
    originalAmount: 100,
    discountAmount: 0,
    amount: 100,
    date: new Date("2026-01-01T00:00:00.000Z"),
    status,
    userId: 8,
    reservationId: 4,
    discountCodeId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function reservation(
  status: ReservationBase["status"],
): ReservationBase {
  return {
    id: 4,
    standId: 7,
    festivalId: 2,
    status,
    source: "user_reservation",
    revealAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("invoice settlement status", () => {
  it("treats only pending invoices as outstanding", () => {
    expect(
      countOutstandingInvoices([
        { status: "pending" },
        { status: "verification_payment" },
        { status: "paid" },
      ]),
    ).toBe(1);
  });

  it("allows a new or replacement proof while pending or under review", () => {
    expect(canAcceptInvoiceProof("pending")).toBe(true);
    expect(canAcceptInvoiceProof("verification_payment")).toBe(true);
    expect(canAcceptInvoiceProof("paid")).toBe(false);
    expect(canAcceptInvoiceProof("cancelled")).toBe(false);
  });

  it("labels verification_payment as En revisión", () => {
    expect(getInvoiceStatusLabel("verification_payment")).toBe("En revisión");
  });

  it("maps an in-review invoice to under review, not outstanding", () => {
    expect(
      mapPaymentStatusToDisplayPaymentStatus(
        invoice("verification_payment"),
        reservation("verification_payment"),
      ),
    ).toBe(DisplayPaymentStatus.UNDER_REVIEW);
  });
});
