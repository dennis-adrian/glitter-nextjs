import { describe, expect, it } from "vitest";

import {
  holdExpiresAtFromNow,
  isFastPassPurchaseHolding,
  resolveActivation,
  resolveBuyerCancellation,
  resolveFastPassSaleState,
  resolveReviewDecision,
  resolveTransactionCancellation,
  resolveVoucherSubmission,
  isAffectedByFestivalCancellation,
  validateOnSiteVisitorData,
} from "@/app/lib/fast-pass/state";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const FUTURE = new Date("2026-08-01T12:20:00.000Z");
const PAST = new Date("2026-08-01T11:40:00.000Z");

const baseSale = {
  offeringEnabled: true,
  cancelledAt: null,
  salesStartAt: null,
  salesEndAt: null,
  onlineSalesEnabled: true,
  onSiteSalesEnabled: true,
  onlineSalesPausedAt: null,
  onSiteSalesPausedAt: null,
};

describe("resolveFastPassSaleState", () => {
  it("is purchasable when offering and channel are open", () => {
    expect(resolveFastPassSaleState(baseSale, "online", NOW)).toEqual({
      state: "on_sale",
      isPurchasable: true,
    });
  });

  it("blocks when offering is disabled without invalidating existing passes", () => {
    expect(
      resolveFastPassSaleState(
        { ...baseSale, offeringEnabled: false },
        "online",
        NOW,
      ),
    ).toMatchObject({ state: "offering_disabled", isPurchasable: false });
  });

  it("blocks a paused channel independently", () => {
    expect(
      resolveFastPassSaleState(
        { ...baseSale, onlineSalesPausedAt: NOW },
        "online",
        NOW,
      ).state,
    ).toBe("channel_paused");
    expect(
      resolveFastPassSaleState(
        { ...baseSale, onlineSalesPausedAt: NOW },
        "on_site",
        NOW,
      ).isPurchasable,
    ).toBe(true);
  });

  it("blocks after festival cancellation", () => {
    expect(
      resolveFastPassSaleState(
        { ...baseSale, cancelledAt: NOW },
        "on_site",
        NOW,
      ).state,
    ).toBe("festival_cancelled");
  });
});

describe("isFastPassPurchaseHolding", () => {
  it("holds pending upload only until the deadline", () => {
    expect(
      isFastPassPurchaseHolding(
        {
          status: "pending_upload",
          holdExpiresAt: FUTURE,
          correctionExpiresAt: null,
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      isFastPassPurchaseHolding(
        {
          status: "pending_upload",
          holdExpiresAt: PAST,
          correctionExpiresAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("holds under verification indefinitely", () => {
    expect(
      isFastPassPurchaseHolding(
        {
          status: "under_verification",
          holdExpiresAt: PAST,
          correctionExpiresAt: null,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("holds changes_requested only while the correction window is open", () => {
    expect(
      isFastPassPurchaseHolding(
        {
          status: "changes_requested",
          holdExpiresAt: PAST,
          correctionExpiresAt: FUTURE,
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      isFastPassPurchaseHolding(
        {
          status: "changes_requested",
          holdExpiresAt: PAST,
          correctionExpiresAt: PAST,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("does not count approved purchases as holds", () => {
    expect(
      isFastPassPurchaseHolding(
        {
          status: "approved",
          holdExpiresAt: FUTURE,
          correctionExpiresAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("resolveVoucherSubmission", () => {
  it("allows upload during a live hold", () => {
    expect(
      resolveVoucherSubmission(
        {
          channel: "online",
          paymentMethod: "bank_qr",
          status: "pending_upload",
          holdExpiresAt: FUTURE,
          correctionExpiresAt: null,
        },
        NOW,
      ),
    ).toEqual({ allowed: true });
  });

  it("blocks at the hold boundary", () => {
    expect(
      resolveVoucherSubmission(
        {
          channel: "online",
          paymentMethod: "bank_qr",
          status: "pending_upload",
          holdExpiresAt: NOW,
          correctionExpiresAt: null,
        },
        NOW,
      ),
    ).toEqual({ allowed: false, blocker: "hold_expired" });
  });

  it("rejects cash proof uploads", () => {
    expect(
      resolveVoucherSubmission(
        {
          channel: "on_site",
          paymentMethod: "cash",
          status: "pending_upload",
          holdExpiresAt: FUTURE,
          correctionExpiresAt: null,
        },
        NOW,
      ).allowed,
    ).toBe(false);
  });
});

describe("resolveReviewDecision", () => {
  it("requires a voucher and a reviewable online status", () => {
    expect(
      resolveReviewDecision(
        { channel: "online", status: "under_verification", voucherCount: 1 },
        "approve",
      ),
    ).toEqual({ allowed: true });
    expect(
      resolveReviewDecision(
        { channel: "online", status: "under_verification", voucherCount: 0 },
        "approve",
      ).allowed,
    ).toBe(false);
    expect(
      resolveReviewDecision(
        { channel: "on_site", status: "under_verification", voucherCount: 1 },
        "approve",
      ).allowed,
    ).toBe(false);
  });
});

describe("resolveBuyerCancellation", () => {
  it("allows cancel only before voucher upload while the hold is live", () => {
    expect(
      resolveBuyerCancellation(
        {
          channel: "online",
          status: "pending_upload",
          holdExpiresAt: FUTURE,
          voucherSubmittedAt: null,
        },
        NOW,
      ),
    ).toEqual({ allowed: true });
    expect(
      resolveBuyerCancellation(
        {
          channel: "online",
          status: "under_verification",
          holdExpiresAt: FUTURE,
          voucherSubmittedAt: NOW,
        },
        NOW,
      ).allowed,
    ).toBe(false);
  });
});

describe("resolveActivation", () => {
  it("activates a valid ticket for the matching day once", () => {
    expect(
      resolveActivation({ status: "valid", festivalDateId: 1 }, 1),
    ).toEqual({ allowed: true });
    expect(
      resolveActivation({ status: "activated", festivalDateId: 1 }, 1),
    ).toEqual({ allowed: false, blocker: "already_activated" });
    expect(
      resolveActivation({ status: "valid", festivalDateId: 1 }, 2),
    ).toEqual({ allowed: false, blocker: "wrong_day" });
  });
});

describe("resolveTransactionCancellation", () => {
  it("restores allocation when no wristband was issued", () => {
    expect(
      resolveTransactionCancellation({
        transactionType: "sale",
        existingCancellationAmount: 0,
        requestedCancellationAmount: 50,
        saleAmount: 50,
        hasActivation: false,
        wristbandsRecovered: false,
      }),
    ).toEqual({ allowed: true, restoresAllocation: true });
  });

  it("keeps capacity consumed when wristbands are unrecovered", () => {
    expect(
      resolveTransactionCancellation({
        transactionType: "sale",
        existingCancellationAmount: 0,
        requestedCancellationAmount: 50,
        saleAmount: 50,
        hasActivation: true,
        wristbandsRecovered: false,
      }),
    ).toEqual({ allowed: true, restoresAllocation: false });
  });

  it("blocks a second cancellation", () => {
    expect(
      resolveTransactionCancellation({
        transactionType: "sale",
        existingCancellationAmount: 50,
        requestedCancellationAmount: 50,
        saleAmount: 50,
        hasActivation: false,
        wristbandsRecovered: true,
      }).allowed,
    ).toBe(false);
  });

  it("allows the first cancellation before any cancellation exists", () => {
    expect(
      resolveTransactionCancellation({
        transactionType: "sale",
        existingCancellationAmount: 0,
        requestedCancellationAmount: 50,
        saleAmount: 50,
        hasActivation: false,
        wristbandsRecovered: false,
      }),
    ).toEqual({ allowed: true, restoresAllocation: true });
  });

  it("blocks a cancellation amount above the sale amount", () => {
    expect(
      resolveTransactionCancellation({
        transactionType: "sale",
        existingCancellationAmount: 0,
        requestedCancellationAmount: 51,
        saleAmount: 50,
        hasActivation: false,
        wristbandsRecovered: false,
      }),
    ).toEqual({ allowed: false, blocker: "amount_exceeds_sale" });
  });
});

describe("holdExpiresAtFromNow", () => {
  it("defaults to a 20-minute window", () => {
    expect(holdExpiresAtFromNow(NOW).getTime()).toBe(FUTURE.getTime());
  });
});

describe("festival cancellation", () => {
  it("closes every active purchase state", () => {
    expect(
      [
        "pending_upload",
        "under_verification",
        "changes_requested",
        "approved",
      ].every((status) =>
        isAffectedByFestivalCancellation(status as "pending_upload"),
      ),
    ).toBe(true);
    expect(isAffectedByFestivalCancellation("cancelled")).toBe(false);
  });
});

describe("on-site visitor data", () => {
  it("allows anonymous sales when details are optional", () => {
    expect(
      validateOnSiteVisitorData({ required: false, holders: [{}] }),
    ).toBeNull();
  });

  it("requires names and at least one purchase contact", () => {
    expect(validateOnSiteVisitorData({ required: true, holders: [{}] })).toBe(
      "holder_name",
    );
    expect(
      validateOnSiteVisitorData({
        required: true,
        holders: [{ firstName: "Ana", lastName: "Pérez" }],
      }),
    ).toBe("purchase_contact");
    expect(
      validateOnSiteVisitorData({
        required: true,
        holders: [{ firstName: "Ana", lastName: "Pérez" }],
        buyerEmail: "ana@example.com",
      }),
    ).toBeNull();
    expect(
      validateOnSiteVisitorData({
        required: true,
        holders: [{ firstName: "Ana", lastName: "Pérez" }],
        buyerPhone: "70000000",
      }),
    ).toBeNull();
    expect(
      validateOnSiteVisitorData({
        required: true,
        holders: [{ firstName: "Ana", lastName: "Pérez" }],
        buyerPhone: "70000000",
        buyerEmail: "ana@example.com",
      }),
    ).toBeNull();
  });
});
