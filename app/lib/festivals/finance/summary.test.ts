import { describe, expect, it } from "vitest";

import type { SpendAttribution } from "@/app/lib/festivals/finance/credit-attribution";
import {
  creditWindowStart,
  resplitMovableCredits,
  summarizeFestivalFinance,
  type FinanceInvoice,
} from "@/app/lib/festivals/finance/summary";
import { computeInvoiceTender } from "@/app/lib/payments/tender";

const FESTIVAL = 7;
const now = new Date("2026-11-01T12:00:00Z");
const windowStart = new Date("2026-10-01T04:00:00Z");

function invoice(
  partial: Partial<FinanceInvoice> & {
    id: number;
    original: number;
    discount?: number;
    amount?: number;
    cash?: number;
    submittedCash?: number;
    credit?: number;
  },
): FinanceInvoice {
  const discount = partial.discount ?? 0;
  const amount = partial.amount ?? partial.original - discount;
  const payments = [];
  const submissions = [];
  if (partial.cash) {
    payments.push({ id: partial.id * 10, amount: partial.cash });
    submissions.push({ paymentId: partial.id * 10, status: "approved" as const });
  }
  if (partial.submittedCash) {
    payments.push({ id: partial.id * 10 + 1, amount: partial.submittedCash });
    submissions.push({ paymentId: partial.id * 10 + 1, status: "submitted" as const });
  }
  return {
    reservationId: partial.id,
    reservationStatus: "accepted",
    status: "pending",
    originalAmount: partial.original,
    discountAmount: discount,
    amount,
    dueAt: null,
    discountCode: null,
    creditSpendIds: [],
    ...partial,
    tender: computeInvoiceTender({
      amount,
      payments,
      submissions,
      allocations: partial.credit ? [{ amount: partial.credit, reversed: false }] : [],
    }),
  };
}

const purchase = (purchasedAt: string, extra = {}) => ({
  kind: "purchase" as const,
  topUpId: 1,
  purchasedAt: new Date(purchasedAt),
  intendedFestivalId: null,
  underReview: false,
  ...extra,
});

describe("creditWindowStart", () => {
  it("starts at midnight in Bolivia, the given days before reservations open", () => {
    // 6 October 10:00 in La Paz (UTC−4).
    const opens = new Date("2026-10-06T14:00:00Z");
    expect(creditWindowStart(opens, 5).toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(creditWindowStart(opens, 0).toISOString()).toBe("2026-10-06T04:00:00.000Z");
  });
});

describe("summarizeFestivalFinance", () => {
  it("steps down from the base price and splits what was collected", () => {
    const attribution: SpendAttribution = new Map([
      [101, [{ amount: 60, source: purchase("2026-10-02T00:00:00Z"), coveredLater: false }]],
      [102, [
        { amount: 30, source: purchase("2026-03-01T00:00:00Z"), coveredLater: false },
        { amount: 10, source: { kind: "gift" }, coveredLater: false },
      ]],
      [201, [{ amount: 50, source: purchase("2026-10-03T00:00:00Z", { underReview: true, topUpId: 4 }), coveredLater: false }]],
    ]);

    const summary = summarizeFestivalFinance({
      festivalId: FESTIVAL,
      now,
      windowStart,
      attribution,
      invoices: [
        // Discounted with a code, paid by voucher.
        invoice({
          id: 1,
          original: 300,
          discount: 60,
          cash: 240,
          discountCode: { code: "FESTI20", unit: "percentage", value: 20 },
        }),
        // Paid partly with credits, the rest overdue.
        invoice({ id: 2, original: 300, credit: 60, creditSpendIds: [101], dueAt: new Date("2026-10-20") }),
        // Settled for less than it cost: a write-off.
        invoice({ id: 3, original: 300, amount: 250, cash: 210, credit: 40, creditSpendIds: [102] }),
        // A voucher waiting for review.
        invoice({ id: 4, original: 200, submittedCash: 200, status: "verification_payment" }),
        // Cancelled but the payment was kept.
        invoice({ id: 5, original: 300, cash: 100, reservationStatus: "cancelled" }),
      ],
      featureSpends: [{ ledgerEntryId: 201, type: "full_table_access", amount: 50 }],
      freeReservations: [{ reservationId: 9, value: 300 }],
    });

    expect(summary).toMatchObject({
      reservations: 4,
      gross: 1100,
      discounts: 60,
      writeOffs: 50,
      writeOffReservations: 1,
      net: 990,
      invoiceCollected: 550,
      inactiveCollected: 100,
      outstanding: 440,
      directPayment: 550,
      invoiceCredits: 100,
      featureCredits: 50,
      creditsTotal: 150,
      collected: 700,
      credits: { festival: 60, earlier: 30, gifted: 10, inReview: 50, unpaid: 0 },
      newMoney: 610,
      inReviewPurchases: 1,
      extras: [{ type: "full_table_access", count: 1, amount: 50 }],
      discountRows: [{ code: "FESTI20", label: "20%", uses: 1, amount: 60 }],
      pending: [
        { key: "overdue", reservations: 1, amount: 240 },
        { key: "inReview", reservations: 1, amount: 200 },
      ],
      free: { count: 1, value: 300 },
    });
    // Net minus what live reservations covered is exactly what is pending.
    expect(summary.net - summary.invoiceCollected).toBe(summary.outstanding);
  });

  it("previews how a different lead days would split purchased credits", () => {
    const attribution: SpendAttribution = new Map([
      [101, [
        { amount: 40, source: purchase("2026-09-28T12:00:00Z"), coveredLater: false },
        { amount: 25, source: purchase("2026-01-01T00:00:00Z", { intendedFestivalId: FESTIVAL }), coveredLater: false },
      ]],
    ]);
    const summary = summarizeFestivalFinance({
      festivalId: FESTIVAL,
      now,
      windowStart,
      attribution,
      invoices: [invoice({ id: 1, original: 65, credit: 65, creditSpendIds: [101] })],
      featureSpends: [],
      freeReservations: [],
    });

    expect(summary.credits).toMatchObject({ festival: 25, earlier: 40 });
    expect(summary.fixedFestivalCredits).toBe(25);

    const opens = new Date("2026-10-06T14:00:00Z");
    expect(resplitMovableCredits(summary.movable, opens, 10, summary.fixedFestivalCredits)).toMatchObject({
      festival: 65,
      earlier: 0,
    });
    expect(resplitMovableCredits(summary.movable, opens, 5, summary.fixedFestivalCredits)).toMatchObject({
      festival: 25,
      earlier: 40,
    });
  });
});
