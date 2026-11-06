import { describe, expect, it } from "vitest";

import {
  invoiceMoneyBlocker,
  strongestMoneyBlocker,
  type InvoiceMoneyRows,
} from "@/app/lib/reservations/full-table-downgrade";

const NOTHING: InvoiceMoneyRows = {
  payments: [],
  allocations: [],
  submissions: [],
};

function proof(
  status: "submitted" | "approved" | "rejected",
  paymentId: number | null = 1,
  kind = "payment_proof",
) {
  return { paymentId, status, kind };
}

describe("invoiceMoneyBlocker", () => {
  it.each<[string, InvoiceMoneyRows, ReturnType<typeof invoiceMoneyBlocker>]>([
    ["an untouched cobro", NOTHING, null],
    [
      // Rejection only marks the submission; the payment row stays behind.
      "a payment whose every comprobante was rejected",
      {
        ...NOTHING,
        payments: [{ id: 1, amount: 900 }],
        submissions: [proof("rejected"), proof("rejected")],
      },
      null,
    ],
    [
      // Handed back by a ledger entry against the spend; the row is history.
      "credits already handed back",
      { ...NOTHING, allocations: [{ amount: 300, reversed: true }] },
      null,
    ],
    [
      "unreversed credits",
      {
        ...NOTHING,
        allocations: [
          { amount: 300, reversed: true },
          { amount: 100, reversed: false },
        ],
      },
      "credits",
    ],
    [
      "an approved payment",
      {
        ...NOTHING,
        payments: [{ id: 1, amount: 300 }],
        submissions: [proof("rejected"), proof("approved")],
      },
      "approved_payment",
    ],
    [
      // A re-upload reuses the rejected row; the new submission is in review.
      "a comprobante in review after a rejected one",
      {
        ...NOTHING,
        payments: [{ id: 1, amount: 300 }],
        submissions: [proof("rejected"), proof("submitted")],
      },
      "proof_under_review",
    ],
    [
      "a zero-value request in review",
      {
        ...NOTHING,
        submissions: [proof("submitted", null, "zero_value_entitlement")],
      },
      "proof_under_review",
    ],
    [
      "an approved zero-value request, which is no money",
      {
        ...NOTHING,
        submissions: [proof("approved", null, "zero_value_entitlement")],
      },
      null,
    ],
    [
      "a legacy payment no submission vouches for",
      { ...NOTHING, payments: [{ id: 7, amount: 500 }] },
      "legacy_payment",
    ],
    [
      "a proof in review wins over credits, since it is the one to resolve",
      {
        payments: [{ id: 1, amount: 300 }],
        allocations: [{ amount: 100, reversed: false }],
        submissions: [proof("submitted")],
      },
      "proof_under_review",
    ],
  ])("%s", (_name, rows, expected) => {
    expect(invoiceMoneyBlocker(rows)).toBe(expected);
  });
});

describe("strongestMoneyBlocker", () => {
  it("is null when no cobro holds money", () => {
    expect(strongestMoneyBlocker([])).toBeNull();
    expect(strongestMoneyBlocker([null, null])).toBeNull();
  });

  it("names the most actionable blocker across cobros", () => {
    expect(strongestMoneyBlocker(["legacy_payment", null, "credits"])).toBe(
      "credits",
    );
    expect(
      strongestMoneyBlocker(["approved_payment", "proof_under_review"]),
    ).toBe("proof_under_review");
  });
});
