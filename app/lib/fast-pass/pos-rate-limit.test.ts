import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const consumeMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeMock,
}));

import { consumePosCredentialResolutionRateLimit } from "@/app/lib/fast-pass/pos-rate-limit";

describe("FastPass POS rate-limit buckets", () => {
  beforeEach(() => {
    headersMock.mockReset();
    consumeMock.mockReset().mockResolvedValue(true);
  });

  it("uses one bounded fallback bucket for invalid client identifiers", async () => {
    headersMock
      .mockResolvedValueOnce(
        new Headers({ "x-forwarded-for": "spoofed-a", "user-agent": "a" }),
      )
      .mockResolvedValueOnce(
        new Headers({ "x-forwarded-for": "spoofed-b", "user-agent": "b" }),
      );

    await consumePosCredentialResolutionRateLimit();
    await consumePosCredentialResolutionRateLimit();

    expect(consumeMock).toHaveBeenCalledTimes(2);
    expect(consumeMock.mock.calls[0][0].key).toBe(
      consumeMock.mock.calls[1][0].key,
    );
  });
});
