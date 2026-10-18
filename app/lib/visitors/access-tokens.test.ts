// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  signVisitorToken,
  verifyVisitorIdToken,
  verifyVisitorToken,
} from "@/app/lib/visitors/access-tokens";

const NOW = Date.parse("2026-10-24T15:00:00Z");
const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  process.env.CLERK_SECRET_KEY = "sk_test_unit";
});

function sessionToken(subject: number | string = 42, ttlMs = HOUR) {
  return signVisitorToken({ purpose: "session", subject, ttlMs, now: NOW });
}

describe("visitor access tokens", () => {
  it("round-trips a visitor id for its purpose", () => {
    expect(verifyVisitorIdToken(sessionToken(), "session", NOW)).toBe(42);
  });

  it("refuses a token minted for another purpose", () => {
    expect(verifyVisitorIdToken(sessionToken(), "history", NOW)).toBeNull();
  });

  it("refuses an expired token", () => {
    expect(verifyVisitorIdToken(sessionToken(), "session", NOW + HOUR)).toBeNull();
  });

  it("refuses a token whose payload was edited to another visitor", () => {
    const [, signature] = sessionToken().split(".");
    const forged = Buffer.from(
      JSON.stringify({ p: "session", s: 43, x: NOW + HOUR }),
    ).toString("base64url");
    expect(
      verifyVisitorIdToken(`${forged}.${signature}`, "session", NOW),
    ).toBeNull();
  });

  it("refuses a token signed with another key", () => {
    const token = sessionToken();
    process.env.CLERK_SECRET_KEY = "sk_test_other";
    try {
      expect(verifyVisitorIdToken(token, "session", NOW)).toBeNull();
    } finally {
      process.env.CLERK_SECRET_KEY = "sk_test_unit";
    }
  });

  it.each([undefined, null, 42, "", "abc", "a.b.c", "a.b", `${"x".repeat(3000)}.y`])(
    "refuses malformed input %#",
    (token) => {
      expect(verifyVisitorToken(token, "session", NOW)).toBeNull();
    },
  );

  it("only accepts positive integer ids as visitor ids", () => {
    expect(verifyVisitorIdToken(sessionToken("42"), "session", NOW)).toBeNull();
    expect(verifyVisitorIdToken(sessionToken(0), "session", NOW)).toBeNull();
    expect(verifyVisitorIdToken(sessionToken(1.5), "session", NOW)).toBeNull();
  });

  it("carries a pending email as a string subject", () => {
    const token = signVisitorToken({
      purpose: "pending-email",
      subject: "ana@mail.com",
      ttlMs: HOUR,
      now: NOW,
    });
    expect(verifyVisitorToken(token, "pending-email", NOW)).toBe("ana@mail.com");
    expect(verifyVisitorIdToken(token, "session", NOW)).toBeNull();
  });
});
