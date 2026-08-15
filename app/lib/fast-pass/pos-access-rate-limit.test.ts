import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/fast-pass/pos-rate-limit", () => ({
  consumePosCredentialResolutionRateLimit: rateLimitMock,
}));
vi.mock("@/db", () => ({ db: { select: selectMock } }));

import {
  resolvePosOperatorByCredential,
  resolvePosOperatorForSettings,
} from "@/app/lib/fast-pass/pos-access";

describe("FastPass POS credential resolution rate limit", () => {
  beforeEach(() => {
    rateLimitMock.mockReset();
    selectMock.mockReset();
  });

  it("does not query credentials after the client bucket is exhausted", async () => {
    rateLimitMock.mockResolvedValue(false);

    await expect(resolvePosOperatorByCredential("credential")).resolves.toEqual(
      { granted: false, reason: "rate_limited" },
    );
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("consumes only one bucket when resolving against settings", async () => {
    rateLimitMock.mockResolvedValue(false);

    await expect(
      resolvePosOperatorForSettings("credential", 10),
    ).resolves.toEqual({ granted: false, reason: "rate_limited" });
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(selectMock).not.toHaveBeenCalled();
  });
});
