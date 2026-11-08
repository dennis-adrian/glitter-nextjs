import { describe, expect, it } from "vitest";

import {
  attributeCreditSpends,
  classifyPortion,
  type AttributionLedgerEntry,
  type AttributionTopUp,
} from "@/app/lib/festivals/finance/credit-attribution";

let nextId = 1;
const day = (d: string) => new Date(`${d}T12:00:00Z`);

function entry(
  partial: Partial<AttributionLedgerEntry> &
    Pick<AttributionLedgerEntry, "type" | "amount" | "createdAt">,
): AttributionLedgerEntry {
  return {
    id: nextId++,
    userId: 1,
    topUpId: null,
    reversesEntryId: null,
    metadata: {},
    ...partial,
  };
}

function topUp(partial: Partial<AttributionTopUp> & Pick<AttributionTopUp, "id">) {
  return {
    status: "approved",
    submittedAt: null,
    intendedFestivalId: null,
    ...partial,
  } satisfies AttributionTopUp;
}

describe("attributeCreditSpends", () => {
  it("spends the oldest credits first, across gifts and purchases", () => {
    const gift = entry({ type: "admin_grant", amount: 50, createdAt: day("2026-01-01") });
    const old = entry({ type: "top_up", amount: 100, topUpId: 1, createdAt: day("2026-02-01") });
    const fresh = entry({ type: "top_up", amount: 200, topUpId: 2, createdAt: day("2026-10-02") });
    const spend = entry({ type: "spend", amount: -300, createdAt: day("2026-10-03") });

    const result = attributeCreditSpends(
      [spend, fresh, old, gift],
      [
        topUp({ id: 1, submittedAt: day("2026-02-01") }),
        topUp({ id: 2, submittedAt: day("2026-10-02") }),
      ],
    );

    expect(result.get(spend.id)?.map((p) => [p.amount, p.source?.kind])).toEqual([
      [50, "gift"],
      [100, "purchase"],
      [150, "purchase"],
    ]);
  });

  it("leaves out a rejected top-up and its reversal, so later credits cover the spend", () => {
    const issue = entry({ type: "top_up", amount: 100, topUpId: 1, createdAt: day("2026-10-01") });
    const spend = entry({ type: "spend", amount: -100, createdAt: day("2026-10-02") });
    const reversal = entry({
      type: "reversal",
      amount: -100,
      topUpId: 1,
      reversesEntryId: issue.id,
      createdAt: day("2026-10-03"),
    });
    const debtTopUp = entry({ type: "top_up", amount: 100, topUpId: 2, createdAt: day("2026-12-01") });

    const result = attributeCreditSpends(
      [issue, spend, reversal, debtTopUp],
      [
        topUp({ id: 1, status: "rejected" }),
        topUp({ id: 2, submittedAt: day("2026-12-01") }),
      ],
    );

    expect(result.get(spend.id)).toEqual([
      {
        amount: 100,
        source: expect.objectContaining({ kind: "purchase", topUpId: 2 }),
        coveredLater: true,
      },
    ]);
  });

  it("marks a spend nothing has covered yet as unfunded", () => {
    const issue = entry({ type: "top_up", amount: 80, topUpId: 1, createdAt: day("2026-10-01") });
    const spend = entry({ type: "spend", amount: -80, createdAt: day("2026-10-02") });
    const reversal = entry({
      type: "reversal",
      amount: -80,
      reversesEntryId: issue.id,
      createdAt: day("2026-10-03"),
    });

    const result = attributeCreditSpends([issue, spend, reversal], [topUp({ id: 1 })]);

    expect(result.get(spend.id)).toEqual([
      { amount: 80, source: null, coveredLater: false },
    ]);
  });

  it("returns a refunded spend's credits to the queue for the next spend", () => {
    const lot = entry({ type: "top_up", amount: 100, topUpId: 1, createdAt: day("2026-01-01") });
    const refunded = entry({ type: "spend", amount: -100, createdAt: day("2026-02-01") });
    const refund = entry({
      type: "admin_adjustment",
      amount: 100,
      reversesEntryId: refunded.id,
      createdAt: day("2026-02-02"),
    });
    const spend = entry({ type: "spend", amount: -100, createdAt: day("2026-03-01") });

    const result = attributeCreditSpends(
      [lot, refunded, refund, spend],
      [topUp({ id: 1, submittedAt: day("2026-01-01") })],
    );

    expect(result.has(refunded.id)).toBe(false);
    expect(result.get(spend.id)?.[0]).toMatchObject({
      amount: 100,
      source: { kind: "purchase", topUpId: 1 },
    });
  });

  it("treats a debt marked paid as a purchase and a waived one as a gift", () => {
    const paid = entry({
      type: "admin_adjustment",
      amount: 30,
      metadata: { resolution: "mark_paid" },
      createdAt: day("2026-01-01"),
    });
    const waived = entry({
      type: "admin_adjustment",
      amount: 20,
      metadata: { resolution: "waive" },
      createdAt: day("2026-01-02"),
    });
    const spend = entry({ type: "spend", amount: -50, createdAt: day("2026-01-03") });

    const result = attributeCreditSpends([paid, waived, spend], []);

    expect(result.get(spend.id)?.map((p) => p.source?.kind)).toEqual(["purchase", "gift"]);
  });

  it("keeps each person's credits apart", () => {
    const a = entry({ userId: 1, type: "admin_grant", amount: 10, createdAt: day("2026-01-01") });
    const b = entry({ userId: 2, type: "top_up", amount: 10, topUpId: 9, createdAt: day("2026-01-01") });
    const spendB = entry({ userId: 2, type: "spend", amount: -10, createdAt: day("2026-01-02") });

    const result = attributeCreditSpends([a, b, spendB], [topUp({ id: 9 })]);

    expect(result.get(spendB.id)?.[0].source?.kind).toBe("purchase");
  });
});

describe("classifyPortion", () => {
  const windowStart = day("2026-10-01");
  const purchase = (
    purchasedAt: Date,
    extra: Partial<{ intendedFestivalId: number | null; underReview: boolean }> = {},
  ) => ({
    kind: "purchase" as const,
    topUpId: 1,
    purchasedAt,
    intendedFestivalId: null,
    underReview: false,
    ...extra,
  });

  it("splits purchases by the window start", () => {
    expect(classifyPortion({ amount: 1, source: purchase(day("2026-10-01")), coveredLater: false }, 7, windowStart)).toBe("festival");
    expect(classifyPortion({ amount: 1, source: purchase(day("2026-09-30")), coveredLater: false }, 7, windowStart)).toBe("earlier");
  });

  it("counts a purchase made for this festival as its own, whenever it was made", () => {
    expect(
      classifyPortion(
        { amount: 1, source: purchase(day("2026-01-01"), { intendedFestivalId: 7 }), coveredLater: false },
        7,
        windowStart,
      ),
    ).toBe("festival");
  });

  it("counts credits that arrived after the spend as this festival's", () => {
    expect(classifyPortion({ amount: 1, source: purchase(day("2026-01-01")), coveredLater: true }, 7, windowStart)).toBe("festival");
  });

  it("puts review, gifts and unfunded spends in their own buckets", () => {
    expect(classifyPortion({ amount: 1, source: purchase(day("2026-10-05"), { underReview: true }), coveredLater: false }, 7, windowStart)).toBe("inReview");
    expect(classifyPortion({ amount: 1, source: { kind: "gift" }, coveredLater: false }, 7, windowStart)).toBe("gifted");
    expect(classifyPortion({ amount: 1, source: null, coveredLater: false }, 7, windowStart)).toBe("unpaid");
  });
});
