import { describe, expect, it } from "vitest";

import {
  expiryDayToTimestamp,
  getDiscountCodeStatus,
  isExpiringSoon,
  isValidDiscountCodeFormat,
  normalizeDiscountCode,
  timestampToExpiryDay,
} from "@/app/lib/discount_codes/utils";

describe("discount code expiry days", () => {
  it("keeps a code valid through the end of the chosen day in La Paz", () => {
    // UTC-4: the 18th ends at 04:00 UTC on the 19th.
    expect(expiryDayToTimestamp("2026-10-18")?.toISOString()).toBe(
      "2026-10-19T03:59:59.999Z",
    );
  });

  it("reads a stored expiry back as the same day", () => {
    const stored = expiryDayToTimestamp("2026-10-18")!;
    expect(timestampToExpiryDay(stored)).toBe("2026-10-18");
  });

  it("shows a code the old form saved at UTC midnight on the day it really ends", () => {
    // The old form stored "2026-10-18" as UTC midnight, which is 20:00 on the
    // 17th in La Paz — the day the list showed and the code stopped working.
    expect(timestampToExpiryDay(new Date("2026-10-18T00:00:00Z"))).toBe(
      "2026-10-17",
    );
  });

  it("refuses something that is not a date", () => {
    expect(expiryDayToTimestamp("")).toBeNull();
    expect(expiryDayToTimestamp("mañana")).toBeNull();
  });
});

describe("getDiscountCodeStatus", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const base = {
    isActive: true,
    expiresAt: new Date("2026-11-01T00:00:00Z"),
    maxUses: null,
    currentUses: 0,
  };

  it("is active while on, in date and under its limit", () => {
    expect(getDiscountCodeStatus(base, now)).toBe("active");
    expect(
      getDiscountCodeStatus({ ...base, maxUses: 5, currentUses: 4 }, now),
    ).toBe("active");
  });

  it("is exhausted once the limit is reached", () => {
    expect(
      getDiscountCodeStatus({ ...base, maxUses: 5, currentUses: 5 }, now),
    ).toBe("exhausted");
  });

  it("reports inactive before exhausted", () => {
    expect(
      getDiscountCodeStatus(
        { ...base, isActive: false, maxUses: 1, currentUses: 1 },
        now,
      ),
    ).toBe("inactive");
  });

  it("reports expired before anything else", () => {
    expect(
      getDiscountCodeStatus(
        {
          isActive: false,
          expiresAt: new Date("2026-10-18T11:59:59Z"),
          maxUses: 1,
          currentUses: 1,
        },
        now,
      ),
    ).toBe("expired");
  });
});

describe("isExpiringSoon", () => {
  const now = new Date("2026-10-18T12:00:00Z");

  it("flags codes ending within a week, not ones already ended", () => {
    expect(isExpiringSoon(new Date("2026-10-20T00:00:00Z"), now)).toBe(true);
    expect(isExpiringSoon(new Date("2026-10-26T00:00:00Z"), now)).toBe(false);
    expect(isExpiringSoon(new Date("2026-10-17T00:00:00Z"), now)).toBe(false);
  });
});

describe("discount code format", () => {
  it("accepts letters, digits, dashes and underscores", () => {
    expect(isValidDiscountCodeFormat("VIP_2026-glitter")).toBe(true);
  });

  it("rejects spaces, symbols and codes too long to apply", () => {
    expect(isValidDiscountCodeFormat("VIP 2026")).toBe(false);
    expect(isValidDiscountCodeFormat("50%OFF")).toBe(false);
    expect(isValidDiscountCodeFormat("A".repeat(65))).toBe(false);
  });

  it("normalizes to the lowercase form codes are stored in", () => {
    expect(normalizeDiscountCode("  Vip2026 ")).toBe("vip2026");
  });
});
