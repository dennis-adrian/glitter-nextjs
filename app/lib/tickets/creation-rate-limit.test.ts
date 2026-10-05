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

import { headers } from "next/headers";

import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import { consumeTicketCreationRateLimit } from "@/app/lib/tickets/creation-rate-limit";

const visitorEmail = "visita@example.test";

function consumed() {
  return vi.mocked(consumeActionRateLimit).mock.calls.map(([bucket]) => bucket);
}

describe("consumeTicketCreationRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestHeaders.current = new Headers({ "x-real-ip": "203.0.113.7" });
  });

  it("keys an anonymous caller by address, generously enough for the venue's wifi", async () => {
    await expect(
      consumeTicketCreationRateLimit({ userId: null, email: visitorEmail }),
    ).resolves.toBe(true);

    const [caller] = consumed();
    expect(caller).toEqual({
      key: expect.stringMatching(/^ticket-create:ip:[0-9a-f]{64}$/),
      limit: 60,
      windowMs: 10 * 60_000,
    });
  });

  it("keeps an anonymous caller in one bucket however they spoof cf-connecting-ip", async () => {
    requestHeaders.current = new Headers({
      "cf-connecting-ip": "1.1.1.1",
      "x-real-ip": "203.0.113.7",
    });
    await consumeTicketCreationRateLimit({ userId: null, email: visitorEmail });
    requestHeaders.current = new Headers({
      "cf-connecting-ip": "2.2.2.2",
      "x-real-ip": "203.0.113.7",
    });
    await consumeTicketCreationRateLimit({ userId: null, email: visitorEmail });

    const [first, , second] = consumed();
    expect(second.key).toBe(first.key);
  });

  it("keys a signed-in caller by user id, not by address", async () => {
    await consumeTicketCreationRateLimit({ userId: 42, email: visitorEmail });

    expect(consumed()[0].key).toBe("ticket-create:user:42");
  });

  it("also limits the visitor's address, whatever its case, without storing it", async () => {
    await consumeTicketCreationRateLimit({ userId: null, email: visitorEmail });
    await consumeTicketCreationRateLimit({
      userId: 42,
      email: " Visita@Example.TEST ",
    });

    const [, first, , second] = consumed();
    expect(first).toEqual({
      key: expect.stringMatching(/^ticket-create:email:[0-9a-f]{64}$/),
      limit: 5,
      windowMs: 60 * 60_000,
    });
    expect(second.key).toBe(first.key);
    expect(first.key).not.toContain("visita");
  });

  it("refuses without touching the address's allowance once the caller is over its limit", async () => {
    vi.mocked(consumeActionRateLimit).mockResolvedValueOnce(false);

    await expect(
      consumeTicketCreationRateLimit({ userId: null, email: visitorEmail }),
    ).resolves.toBe(false);
    expect(consumeActionRateLimit).toHaveBeenCalledOnce();
  });

  it("refuses once the address is over its limit", async () => {
    vi.mocked(consumeActionRateLimit)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      consumeTicketCreationRateLimit({ userId: null, email: visitorEmail }),
    ).resolves.toBe(false);
  });

  it("fails closed when the limiter throws", async () => {
    vi.mocked(consumeActionRateLimit).mockRejectedValueOnce(new Error("db down"));

    await expect(
      consumeTicketCreationRateLimit({ userId: null, email: visitorEmail }),
    ).resolves.toBe(false);
  });

  it("fails closed when the request headers are unavailable", async () => {
    vi.mocked(headers).mockRejectedValueOnce(new Error("outside a request"));

    await expect(
      consumeTicketCreationRateLimit({ userId: null, email: visitorEmail }),
    ).resolves.toBe(false);
    expect(consumeActionRateLimit).not.toHaveBeenCalled();
  });
});
