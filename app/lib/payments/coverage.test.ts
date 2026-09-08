import { describe, expect, it } from "vitest";

import {
  deriveCoverageState,
  getCoverageLabel,
  type CoverageInput,
} from "@/app/lib/payments/coverage";

const NOW = new Date("2026-09-08T20:00:00Z");
const YESTERDAY = new Date("2026-09-07T20:00:00Z");
const TOMORROW = new Date("2026-09-09T20:00:00Z");

function coverage(overrides: Partial<CoverageInput> = {}) {
  return deriveCoverageState({
    invoiceStatus: "pending",
    reservationStatus: "pending",
    tender: { totalAmount: 400, coveredAmount: 0, submittedCashAmount: 0 },
    dueAt: TOMORROW,
    now: NOW,
    ...overrides,
  });
}

describe("deriveCoverageState", () => {
  it("reports an untouched invoice as unpaid", () => {
    expect(coverage()).toBe("unpaid");
  });

  it("reports partial coverage once credits are applied", () => {
    expect(
      coverage({
        tender: { totalAmount: 400, coveredAmount: 20, submittedCashAmount: 0 },
      }),
    ).toBe("partial");
  });

  it("reports a submitted voucher as under review", () => {
    expect(
      coverage({
        invoiceStatus: "verification_payment",
        reservationStatus: "verification_payment",
        tender: {
          totalAmount: 370,
          coveredAmount: 20,
          submittedCashAmount: 350,
        },
      }),
    ).toBe("under_review");
  });

  it("prefers under review over overdue when a voucher is waiting", () => {
    expect(
      coverage({
        invoiceStatus: "verification_payment",
        dueAt: YESTERDAY,
        tender: {
          totalAmount: 400,
          coveredAmount: 0,
          submittedCashAmount: 400,
        },
      }),
    ).toBe("under_review");
  });

  it("reports overdue once due_at has passed", () => {
    expect(coverage({ dueAt: YESTERDAY })).toBe("overdue");
  });

  it("honours an extended deadline instead of the creation date", () => {
    // extendReservationPaymentDeadline writes due_at; the old helper recomputed
    // createdAt + 5 days and kept showing "Atrasado" after an extension.
    expect(coverage({ dueAt: TOMORROW })).toBe("unpaid");
  });

  it("does not report overdue for an accepted reservation", () => {
    expect(coverage({ dueAt: YESTERDAY, reservationStatus: "accepted" })).toBe(
      "unpaid",
    );
  });

  it("treats a missing due date as not overdue", () => {
    expect(coverage({ dueAt: null })).toBe("unpaid");
  });

  it("reports paid regardless of tender arithmetic", () => {
    expect(coverage({ invoiceStatus: "paid", dueAt: YESTERDAY })).toBe("paid");
  });

  it("reports cancelled ahead of every other state", () => {
    expect(
      coverage({
        invoiceStatus: "cancelled",
        dueAt: YESTERDAY,
        tender: {
          totalAmount: 400,
          coveredAmount: 20,
          submittedCashAmount: 380,
        },
      }),
    ).toBe("cancelled");
  });

  it("accepts a serialized due date", () => {
    expect(coverage({ dueAt: "2026-09-07T20:00:00Z" })).toBe("overdue");
  });

  it("labels every state in Spanish", () => {
    expect(getCoverageLabel("partial")).toBe("Parcial");
    expect(getCoverageLabel("under_review")).toBe("En revisión");
    expect(getCoverageLabel("overdue")).toBe("Atrasado");
  });
});
