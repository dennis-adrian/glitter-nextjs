import { describe, expect, it } from "vitest";

import {
  isHoldIntentExpired,
  nextHoldIntent,
} from "@/app/lib/stands/hold-intent";

describe("isHoldIntentExpired", () => {
  it("treats a missing cache as not expired", () => {
    expect(isHoldIntentExpired(null, 1_000)).toBe(false);
  });

  it("expires from cached.expiresAt alone, even if a live hold is still in UI state", () => {
    expect(isHoldIntentExpired({ expiresAt: 1_000 }, 1_000)).toBe(true);
    expect(isHoldIntentExpired({ expiresAt: 1_000 }, 1_001)).toBe(true);
    expect(isHoldIntentExpired({ expiresAt: 1_000 }, 999)).toBe(false);
  });
});

describe("nextHoldIntent", () => {
  const ttlMs = 5 * 60 * 1000;

  it("reuses the cached key while it is still valid for the same stand", () => {
    const cached = {
      standId: 7,
      key: "existing-key",
      expiresAt: 10_000,
    };

    expect(nextHoldIntent(cached, 7, 9_999, ttlMs, () => "new-key")).toEqual(
      cached,
    );
  });

  it("mints a new key after expiry even when the caller still has an activeHold", () => {
    const cached = {
      standId: 7,
      key: "expired-key",
      expiresAt: 10_000,
    };

    expect(nextHoldIntent(cached, 7, 10_000, ttlMs, () => "fresh-key")).toEqual(
      {
        standId: 7,
        key: "fresh-key",
        expiresAt: 10_000 + ttlMs,
      },
    );
  });

  it("mints a new key when the stand changes", () => {
    const cached = {
      standId: 7,
      key: "other-stand-key",
      expiresAt: 20_000,
    };

    expect(
      nextHoldIntent(cached, 8, 1_000, ttlMs, () => "stand-8-key"),
    ).toEqual({
      standId: 8,
      key: "stand-8-key",
      expiresAt: 1_000 + ttlMs,
    });
  });
});
