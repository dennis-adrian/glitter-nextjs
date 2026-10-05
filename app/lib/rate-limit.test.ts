import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import {
  callerFingerprint,
  callerRateLimitKey,
  emailFingerprint,
} from "@/app/lib/rate-limit";

describe("callerFingerprint", () => {
  it("ignores cf-connecting-ip, which Vercel passes through as the client sent it", () => {
    const first = callerFingerprint(
      new Headers({ "cf-connecting-ip": "1.1.1.1", "x-real-ip": "203.0.113.7" }),
    );
    const second = callerFingerprint(
      new Headers({ "cf-connecting-ip": "2.2.2.2", "x-real-ip": "203.0.113.7" }),
    );

    expect(first).toBe(second);
    expect(first).toBe(callerFingerprint(new Headers({ "x-real-ip": "203.0.113.7" })));
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    expect(
      callerFingerprint(
        new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }),
      ),
    ).toBe(callerFingerprint(new Headers({ "x-real-ip": "203.0.113.7" })));
  });

  it("falls back to the first x-forwarded-for hop", () => {
    expect(
      callerFingerprint(
        new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }),
      ),
    ).toBe(callerFingerprint(new Headers({ "x-forwarded-for": "198.51.100.1" })));
  });

  it("tells different addresses apart and does not expose them", () => {
    const fingerprint = callerFingerprint(new Headers({ "x-real-ip": "203.0.113.7" }));

    expect(fingerprint).not.toBe(
      callerFingerprint(new Headers({ "x-real-ip": "203.0.113.8" })),
    );
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("callerRateLimitKey", () => {
  const sharedNetwork = new Headers({ "x-real-ip": "203.0.113.7" });

  it("keys a signed-in caller by account, so a shared network does not pool them", () => {
    expect(callerRateLimitKey(42, sharedNetwork)).toBe("user:42");
    expect(callerRateLimitKey(43, sharedNetwork)).toBe("user:43");
  });

  it("keys an anonymous caller by network address", () => {
    expect(callerRateLimitKey(null, sharedNetwork)).toBe(
      `ip:${callerFingerprint(sharedNetwork)}`,
    );
  });
});

describe("emailFingerprint", () => {
  it("names one mailbox however its address is cased or padded", () => {
    expect(emailFingerprint(" Visita@Example.TEST ")).toBe(
      emailFingerprint("visita@example.test"),
    );
  });

  it("tells addresses apart and does not expose them", () => {
    const fingerprint = emailFingerprint("visita@example.test");

    expect(fingerprint).not.toBe(emailFingerprint("otra@example.test"));
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
