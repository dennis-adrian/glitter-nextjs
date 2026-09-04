// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearFullTableDismissal,
  dismissFullTableBanner,
  isFullTableBannerDismissed,
} from "@/app/components/festivals/reservations/full-table-dismissal";

describe("full-table banner dismissal", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("remembers a dismissal per festival", () => {
    dismissFullTableBanner(7);

    expect(isFullTableBannerDismissed(7)).toBe(true);
    // Another festival's banner is a separate offer.
    expect(isFullTableBannerDismissed(8)).toBe(false);
  });

  /**
   * Paying for the offer contradicts having hidden it. Without this, someone
   * who dismissed the banner and then bought from the introduction screen
   * could land back on a map with no way to activate what they paid for.
   */
  it("forgets the dismissal once the purchase is paid", () => {
    dismissFullTableBanner(7);
    dismissFullTableBanner(8);

    clearFullTableDismissal(7);

    expect(isFullTableBannerDismissed(7)).toBe(false);
    expect(isFullTableBannerDismissed(8)).toBe(true);
  });

  it("treats a browser that refuses storage as not dismissed", () => {
    // Private windows and blocked site data throw on access rather than
    // returning null. Failing closed here shows the banner, which is the safe
    // direction — the alternative hides the only route to activation.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(isFullTableBannerDismissed(7)).toBe(false);
  });

  it("does not throw when storage refuses a write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => dismissFullTableBanner(7)).not.toThrow();
    expect(() => clearFullTableDismissal(7)).not.toThrow();
  });
});
