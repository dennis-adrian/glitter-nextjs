import { describe, expect, it } from "vitest";

import {
  computeInvoiceTender,
  isOverAllocated,
  type InvoiceTenderInput,
} from "@/app/lib/payments/tender";

function tender(overrides: Partial<InvoiceTenderInput> = {}) {
  return computeInvoiceTender({
    amount: 400,
    allocations: [],
    payments: [],
    submissions: [],
    ...overrides,
  });
}

describe("computeInvoiceTender", () => {
  it("treats an untouched invoice as fully outstanding", () => {
    const result = tender();
    expect(result.coveredAmount).toBe(0);
    expect(result.outstandingAmount).toBe(400);
  });

  it("counts credits that have not been reversed", () => {
    const result = tender({
      allocations: [{ amount: 20, reversed: false }],
    });
    expect(result.confirmedCreditAmount).toBe(20);
    expect(result.coveredAmount).toBe(20);
    expect(result.outstandingAmount).toBe(380);
  });

  it("excludes a reversed allocation and restores the outstanding balance", () => {
    const result = tender({
      allocations: [
        { amount: 20, reversed: true },
        { amount: 50, reversed: false },
      ],
    });
    expect(result.confirmedCreditAmount).toBe(50);
    expect(result.outstandingAmount).toBe(350);
  });

  it("counts cash only once its submission is approved", () => {
    const result = tender({
      payments: [{ id: 1, amount: 380 }],
      submissions: [{ paymentId: 1, status: "approved" }],
      allocations: [{ amount: 20, reversed: false }],
    });
    expect(result.approvedCashAmount).toBe(380);
    expect(result.coveredAmount).toBe(400);
    expect(result.outstandingAmount).toBe(0);
  });

  it("reports submitted cash separately and leaves it uncovered", () => {
    // Invoice 1837 in the restored data: Bs370 with Bs20 of credits and a
    // Bs350 voucher still in the review queue.
    const result = tender({
      amount: 370,
      allocations: [{ amount: 20, reversed: false }],
      payments: [{ id: 7, amount: 350 }],
      submissions: [{ paymentId: 7, status: "submitted" }],
    });
    expect(result.submittedCashAmount).toBe(350);
    expect(result.approvedCashAmount).toBe(0);
    expect(result.coveredAmount).toBe(20);
    expect(result.outstandingAmount).toBe(350);
  });

  it("ignores a payment whose submission was rejected", () => {
    const result = tender({
      payments: [{ id: 3, amount: 400 }],
      submissions: [{ paymentId: 3, status: "rejected" }],
    });
    expect(result.approvedCashAmount).toBe(0);
    expect(result.submittedCashAmount).toBe(0);
    expect(result.outstandingAmount).toBe(400);
  });

  it("counts a payment once when several submissions point at it", () => {
    // submitPaymentProof mutates the payment row in place, so one payment can
    // carry a chain of superseded submissions.
    const result = tender({
      payments: [{ id: 9, amount: 400 }],
      submissions: [
        { paymentId: 9, status: "approved" },
        { paymentId: 9, status: "approved" },
      ],
    });
    expect(result.approvedCashAmount).toBe(400);
    expect(result.outstandingAmount).toBe(0);
  });

  it("accepts the string amounts drizzle returns for money columns", () => {
    const result = tender({
      amount: "370.00",
      allocations: [{ amount: "20.00", reversed: false }],
    });
    expect(result.totalAmount).toBe(370);
    expect(result.confirmedCreditAmount).toBe(20);
    expect(result.outstandingAmount).toBe(350);
  });

  it("rounds to two decimals rather than accumulating float error", () => {
    const result = tender({
      amount: 100,
      allocations: [
        { amount: 33.33, reversed: false },
        { amount: 33.33, reversed: false },
        { amount: 33.33, reversed: false },
      ],
    });
    expect(result.confirmedCreditAmount).toBe(99.99);
    expect(result.outstandingAmount).toBe(0.01);
  });

  it("never reports a negative outstanding balance", () => {
    const result = tender({
      amount: 50,
      allocations: [{ amount: 120, reversed: false }],
    });
    expect(result.outstandingAmount).toBe(0);
    expect(isOverAllocated(result)).toBe(true);
  });

  it("does not flag a fully covered invoice as over-allocated", () => {
    const result = tender({
      amount: 400,
      allocations: [{ amount: 400, reversed: false }],
    });
    expect(isOverAllocated(result)).toBe(false);
  });

  it("ignores a submission with no payment, such as a zero-value entitlement", () => {
    const result = tender({
      amount: 0,
      submissions: [{ paymentId: null, status: "approved" }],
    });
    expect(result.approvedCashAmount).toBe(0);
    expect(result.outstandingAmount).toBe(0);
  });
});
