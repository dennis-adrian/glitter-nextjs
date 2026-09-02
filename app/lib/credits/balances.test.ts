import { describe, expect, it } from "vitest";

import {
  calculateCreditBalances,
  exactCreditShortfall,
} from "@/app/lib/credits/balances";

describe("credit balances", () => {
  it("keeps provisional issuance spendable for features but ineligible for invoices", () => {
    expect(
      calculateCreditBalances({
        ledgerBalance: 40,
        activeHolds: 0,
        underReviewIssuance: 40,
      }),
    ).toMatchObject({
      spendableBalance: 40,
      invoiceEligibleBalance: 0,
    });
  });

  it("subtracts holds without changing ledger balance", () => {
    expect(
      calculateCreditBalances({
        ledgerBalance: 50,
        activeHolds: 12.5,
        underReviewIssuance: 0,
      }),
    ).toMatchObject({
      ledgerBalance: 50,
      spendableBalance: 37.5,
      invoiceEligibleBalance: 37.5,
    });
  });

  it("allows debt after a provisional spend is reversed", () => {
    expect(
      calculateCreditBalances({
        ledgerBalance: -15,
        activeHolds: 0,
        underReviewIssuance: 0,
      }),
    ).toMatchObject({
      spendableBalance: -15,
      invoiceEligibleBalance: 0,
    });
  });

  it("requires a top-up to first cover debt", () => {
    expect(exactCreditShortfall(10, -15)).toBe(25);
    expect(exactCreditShortfall(10, 7.5)).toBe(2.5);
    expect(exactCreditShortfall(10, 12)).toBe(0);
  });
});
