import { describe, expect, it } from "vitest";

import { latePartnerPrice } from "@/app/lib/reservations/late-partner-pricing";

describe("latePartnerPrice", () => {
  it("charges the shared difference plus the feature price", () => {
    expect(
      latePartnerPrice({
        individualPriceSnapshot: 370,
        sharedPriceSnapshot: 400,
        fullTablePriceSnapshot: null,
        featurePrice: 25,
      }),
    ).toEqual({
      sharedPriceDifference: 30,
      featurePrice: 25,
      totalCredits: 55,
      fullTable: false,
    });
  });

  /**
   * The two components stay separate all the way to the ledger (PRD §6.2), so
   * reporting can say what was a price adjustment and what was a fee.
   */
  it("keeps the components separate rather than only their sum", () => {
    const price = latePartnerPrice({
      individualPriceSnapshot: 100,
      sharedPriceSnapshot: 180,
      fullTablePriceSnapshot: null,
      featurePrice: 20,
    })!;

    expect(price.sharedPriceDifference).toBe(80);
    expect(price.featurePrice).toBe(20);
    expect(price.totalCredits).toBe(100);
  });

  /**
   * No shared price was agreed at booking, so there is no figure for what two
   * people cost. Guessing one would invent a charge.
   */
  it("refuses to price a reservation with no shared snapshot", () => {
    expect(
      latePartnerPrice({
        individualPriceSnapshot: 370,
        sharedPriceSnapshot: null,
        fullTablePriceSnapshot: null,
        featurePrice: 25,
      }),
    ).toBeNull();
  });

  /**
   * The stand table enforces shared >= individual, but these are snapshots of
   * a past booking. A negative difference would quietly refund part of the fee.
   */
  it("floors an inverted snapshot pair at zero rather than refunding", () => {
    const price = latePartnerPrice({
      individualPriceSnapshot: 400,
      sharedPriceSnapshot: 370,
      fullTablePriceSnapshot: null,
      featurePrice: 25,
    })!;

    expect(price.sharedPriceDifference).toBe(0);
    expect(price.totalCredits).toBe(25);
  });

  it("treats a missing individual snapshot as zero", () => {
    const price = latePartnerPrice({
      individualPriceSnapshot: null,
      sharedPriceSnapshot: 400,
      fullTablePriceSnapshot: null,
      featurePrice: 0,
    })!;

    expect(price.sharedPriceDifference).toBe(400);
    expect(price.totalCredits).toBe(400);
  });

  it("keeps two-decimal money exact", () => {
    const price = latePartnerPrice({
      individualPriceSnapshot: 370.1,
      sharedPriceSnapshot: 400.35,
      fullTablePriceSnapshot: null,
      featurePrice: 25.05,
    })!;

    expect(price.sharedPriceDifference).toBe(30.25);
    expect(price.totalCredits).toBe(55.3);
  });

  it("refuses a negative feature price", () => {
    expect(
      latePartnerPrice({
        individualPriceSnapshot: 370,
        sharedPriceSnapshot: 400,
        fullTablePriceSnapshot: null,
        featurePrice: -1,
      }),
    ).toBeNull();
  });

  /** A free feature is configuration, not an error: the difference still bills. */
  it("allows a zero feature price", () => {
    const price = latePartnerPrice({
      individualPriceSnapshot: 370,
      sharedPriceSnapshot: 400,
      fullTablePriceSnapshot: null,
      featurePrice: 0,
    })!;

    expect(price.totalCredits).toBe(30);
  });

  describe("on a full table", () => {
    /**
     * A table is priced as its own product whatever its headcount (PRD §7.1).
     * Its halves keep both illustration snapshots, so without the table flag
     * this charged `shared - individual` for a second person the table price
     * already covers.
     */
    it("charges the fee only, with no shared difference", () => {
      expect(
        latePartnerPrice({
          individualPriceSnapshot: 500,
          sharedPriceSnapshot: 800,
          fullTablePriceSnapshot: 1200,
          featurePrice: 25,
        }),
      ).toEqual({
        sharedPriceDifference: 0,
        featurePrice: 25,
        totalCredits: 25,
        fullTable: true,
      });
    });

    /** No shared price is needed: the table price already covers two people. */
    it("prices a table that has no shared snapshot", () => {
      expect(
        latePartnerPrice({
          individualPriceSnapshot: 500,
          sharedPriceSnapshot: null,
          fullTablePriceSnapshot: 1200,
          featurePrice: 25,
        }),
      ).toEqual({
        sharedPriceDifference: 0,
        featurePrice: 25,
        totalCredits: 25,
        fullTable: true,
      });
    });

    /**
     * A table snapshotted at zero (a free table) is still a table. Testing the
     * snapshot for truthiness would fall through to the half prices.
     */
    it("treats a zero table price as a table", () => {
      const price = latePartnerPrice({
        individualPriceSnapshot: 500,
        sharedPriceSnapshot: 800,
        fullTablePriceSnapshot: 0,
        featurePrice: 25,
      })!;

      expect(price.sharedPriceDifference).toBe(0);
      expect(price.totalCredits).toBe(25);
      expect(price.fullTable).toBe(true);
    });

    it("keeps a free feature free", () => {
      expect(
        latePartnerPrice({
          individualPriceSnapshot: 500,
          sharedPriceSnapshot: 800,
          fullTablePriceSnapshot: 1200,
          featurePrice: 0,
        })?.totalCredits,
      ).toBe(0);
    });

    it("keeps two-decimal money exact", () => {
      expect(
        latePartnerPrice({
          individualPriceSnapshot: 500,
          sharedPriceSnapshot: 800,
          fullTablePriceSnapshot: 1200,
          featurePrice: 25.05,
        })?.totalCredits,
      ).toBe(25.05);
    });

    it("still refuses a negative feature price", () => {
      expect(
        latePartnerPrice({
          individualPriceSnapshot: 500,
          sharedPriceSnapshot: 800,
          fullTablePriceSnapshot: 1200,
          featurePrice: -1,
        }),
      ).toBeNull();
    });
  });

  /** The flag says what was priced, so the quote can explain the total. */
  it("marks a half table as not a full table", () => {
    expect(
      latePartnerPrice({
        individualPriceSnapshot: 370,
        sharedPriceSnapshot: 400,
        fullTablePriceSnapshot: null,
        featurePrice: 25,
      })?.fullTable,
    ).toBe(false);
  });
});
