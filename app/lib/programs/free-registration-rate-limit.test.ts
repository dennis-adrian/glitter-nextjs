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

import { consumeFreeRegistrationRateLimit } from "@/app/lib/programs/free-registration-rate-limit";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";

function lastBucket() {
  return vi.mocked(consumeActionRateLimit).mock.lastCall?.[0];
}

describe("consumeFreeRegistrationRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestHeaders.current = new Headers({ "x-real-ip": "203.0.113.7" });
  });

  it("keys a guest by address, generously enough for the venue's wifi", async () => {
    await expect(consumeFreeRegistrationRateLimit(null)).resolves.toBe(true);

    expect(lastBucket()).toEqual({
      key: expect.stringMatching(/^free-registration:ip:[0-9a-f]{64}$/),
      limit: 30,
      windowMs: 10 * 60_000,
    });
  });

  it("keeps a guest in one bucket however they spoof cf-connecting-ip", async () => {
    requestHeaders.current = new Headers({
      "cf-connecting-ip": "1.1.1.1",
      "x-real-ip": "203.0.113.7",
    });
    await consumeFreeRegistrationRateLimit(null);
    const first = lastBucket()?.key;
    requestHeaders.current = new Headers({
      "cf-connecting-ip": "2.2.2.2",
      "x-real-ip": "203.0.113.7",
    });
    await consumeFreeRegistrationRateLimit(null);

    expect(lastBucket()?.key).toBe(first);
  });

  it("keys a signed-in caller by user id, with the tighter account limit", async () => {
    await consumeFreeRegistrationRateLimit(42);

    expect(lastBucket()).toEqual({
      key: "free-registration:user:42",
      limit: 10,
      windowMs: 10 * 60_000,
    });
  });

  it("refuses a caller over the limit", async () => {
    vi.mocked(consumeActionRateLimit).mockResolvedValueOnce(false);

    await expect(consumeFreeRegistrationRateLimit(null)).resolves.toBe(false);
  });

  it("fails closed when the limiter throws", async () => {
    vi.mocked(consumeActionRateLimit).mockRejectedValueOnce(new Error("db down"));

    await expect(consumeFreeRegistrationRateLimit(null)).resolves.toBe(false);
  });
});
