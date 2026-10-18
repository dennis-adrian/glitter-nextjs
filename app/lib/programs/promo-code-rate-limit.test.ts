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

import { consumeProgramPromoPreviewRateLimit } from "@/app/lib/programs/promo-code-rate-limit";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";

async function bucketFor(headers: Record<string, string>) {
  requestHeaders.current = new Headers(headers);
  await consumeProgramPromoPreviewRateLimit(null);
  return vi.mocked(consumeActionRateLimit).mock.lastCall?.[0].key;
}

describe("consumeProgramPromoPreviewRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps an anonymous caller in one bucket however they spoof cf-connecting-ip", async () => {
    const first = await bucketFor({
      "cf-connecting-ip": "1.1.1.1",
      "x-real-ip": "203.0.113.7",
    });
    const second = await bucketFor({
      "cf-connecting-ip": "2.2.2.2",
      "x-real-ip": "203.0.113.7",
    });

    expect(first).toMatch(/^program-promo-preview:ip:[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it("keys a signed-in caller by user id, not by address", async () => {
    requestHeaders.current = new Headers({ "x-real-ip": "203.0.113.7" });
    await consumeProgramPromoPreviewRateLimit(42);

    expect(vi.mocked(consumeActionRateLimit).mock.lastCall?.[0].key).toBe(
      "program-promo-preview:user:42",
    );
  });

  it("fails closed when the limiter throws", async () => {
    vi.mocked(consumeActionRateLimit).mockRejectedValueOnce(new Error("db down"));

    await expect(consumeProgramPromoPreviewRateLimit(null)).resolves.toBe(false);
  });
});
