import { describe, expect, it } from "vitest";

import {
  canRevertCreditEntry,
  CREDIT_LEDGER_KINDS,
  CreditAccountsSearchParamsSchema,
  CreditLedgerSearchParamsSchema,
} from "@/app/lib/credits/admin-definitions";

describe("canRevertCreditEntry", () => {
  it.each([
    ["grant", true],
    ["deduction", true],
    ["adjustment", true],
    ["debt_resolution", true],
    // Undone elsewhere: by rejecting the voucher, or by whatever booked it.
    ["purchase", false],
    ["spend", false],
    ["voucher_reversal", false],
    // Taking a refund back would leave its invoice allocation gone and the
    // credits gone with it.
    ["refund", false],
    ["revert", false],
  ] as const)("%s → %s", (kind, expected) => {
    expect(canRevertCreditEntry({ kind, isReverted: false })).toBe(expected);
  });

  it("never offers a second undo", () => {
    expect(canRevertCreditEntry({ kind: "grant", isReverted: true })).toBe(
      false,
    );
  });
});

describe("CreditAccountsSearchParamsSchema", () => {
  it("defaults to every account, richest first", () => {
    expect(CreditAccountsSearchParamsSchema.parse({})).toEqual({
      query: "",
      filter: "all",
      sort: "balance",
      direction: "desc",
      limit: 25,
      offset: 0,
    });
  });

  it("falls back per field instead of rejecting a stale URL", () => {
    expect(
      CreditAccountsSearchParamsSchema.parse({
        query: "  ana  ",
        filter: "bogus",
        sort: "spent",
        direction: "sideways",
        limit: "5000",
        offset: "-3",
      }),
    ).toEqual({
      query: "ana",
      filter: "all",
      sort: "spent",
      direction: "desc",
      limit: 25,
      offset: 0,
    });
  });
});

describe("CreditLedgerSearchParamsSchema", () => {
  it("reads one kind or several, and drops unknown ones", () => {
    expect(
      CreditLedgerSearchParamsSchema.parse({ kind: "spend" }).kind,
    ).toEqual(["spend"]);
    expect(
      CreditLedgerSearchParamsSchema.parse({
        kind: ["refund", "nope", "grant"],
      }).kind,
    ).toEqual(["refund", "grant"]);
    expect(CreditLedgerSearchParamsSchema.parse({ kind: "nope" }).kind).toEqual(
      [],
    );
    expect(CreditLedgerSearchParamsSchema.parse({}).kind).toEqual([]);
  });

  it("accepts calendar dates and ids, and ignores malformed ones", () => {
    expect(
      CreditLedgerSearchParamsSchema.parse({
        from: "2026-09-01",
        to: "01/09/2026",
        userId: "12",
        festivalId: "abc",
      }),
    ).toMatchObject({
      from: "2026-09-01",
      to: undefined,
      userId: 12,
      festivalId: undefined,
    });
  });

  it("knows every kind the SQL classification can return", () => {
    expect(CREDIT_LEDGER_KINDS).toHaveLength(9);
  });
});
