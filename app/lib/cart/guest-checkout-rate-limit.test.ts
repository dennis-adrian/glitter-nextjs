import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeaders.current),
}));
vi.mock("@/app/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/rate-limit")>()),
  consumeActionRateLimit: vi.fn(async () => true),
}));

import { consumeGuestCheckoutRateLimit } from "@/app/lib/cart/guest-checkout-rate-limit";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";

const guestEmail = "invitada@example.test";

function consumed() {
  return vi.mocked(consumeActionRateLimit).mock.calls.map(([bucket]) => bucket);
}

describe("consumeGuestCheckoutRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestHeaders.current = new Headers({ "x-real-ip": "203.0.113.7" });
  });

  it("keys an anonymous caller by address", async () => {
    await expect(
      consumeGuestCheckoutRateLimit({ userId: null, email: guestEmail }),
    ).resolves.toBe(true);

    expect(consumed()[0]).toEqual({
      key: expect.stringMatching(/^guest-checkout:ip:[0-9a-f]{64}$/),
      limit: 10,
      windowMs: 60 * 60_000,
    });
  });

  it("keeps an anonymous caller in one bucket however they spoof cf-connecting-ip", async () => {
    requestHeaders.current = new Headers({
      "cf-connecting-ip": "1.1.1.1",
      "x-real-ip": "203.0.113.7",
    });
    await consumeGuestCheckoutRateLimit({ userId: null, email: guestEmail });
    requestHeaders.current = new Headers({
      "cf-connecting-ip": "2.2.2.2",
      "x-real-ip": "203.0.113.7",
    });
    await consumeGuestCheckoutRateLimit({ userId: null, email: guestEmail });

    const [first, , second] = consumed();
    expect(second.key).toBe(first.key);
  });

  it("keys a signed-in caller by user id, not by address", async () => {
    await consumeGuestCheckoutRateLimit({ userId: 42, email: guestEmail });

    expect(consumed()[0].key).toBe("guest-checkout:user:42");
  });

  it("also limits the contact address, whatever its case, without storing it", async () => {
    await consumeGuestCheckoutRateLimit({ userId: null, email: guestEmail });
    await consumeGuestCheckoutRateLimit({
      userId: 42,
      email: "Invitada@Example.TEST",
    });

    const [, first, , second] = consumed();
    expect(first).toEqual({
      key: expect.stringMatching(/^guest-checkout:email:[0-9a-f]{64}$/),
      limit: 5,
      windowMs: 60 * 60_000,
    });
    expect(second.key).toBe(first.key);
    expect(first.key).not.toContain("invitada");
  });

  it("refuses without touching the address's allowance once the caller is over its limit", async () => {
    vi.mocked(consumeActionRateLimit).mockResolvedValueOnce(false);

    await expect(
      consumeGuestCheckoutRateLimit({ userId: null, email: guestEmail }),
    ).resolves.toBe(false);
    expect(consumeActionRateLimit).toHaveBeenCalledOnce();
  });

  it("refuses once the address is over its limit", async () => {
    vi.mocked(consumeActionRateLimit)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      consumeGuestCheckoutRateLimit({ userId: null, email: guestEmail }),
    ).resolves.toBe(false);
  });

  it("fails closed when the limiter throws", async () => {
    vi.mocked(consumeActionRateLimit).mockRejectedValueOnce(new Error("db down"));

    await expect(
      consumeGuestCheckoutRateLimit({ userId: null, email: guestEmail }),
    ).resolves.toBe(false);
  });
});
