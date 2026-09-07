import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const consumeRateLimitMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeRateLimitMock,
}));

vi.mock("@/app/lib/reservations/partner-search", () => ({
  searchPotentialPartnersForActor: searchMock,
}));

import { searchPotentialPartners } from "@/app/lib/reservations/participant-actions";

describe("searchPotentialPartners", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    consumeRateLimitMock.mockReset();
    searchMock.mockReset();
    consumeRateLimitMock.mockResolvedValue(true);
  });

  it("returns empty for unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(searchPotentialPartners(10, "ana")).resolves.toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("ignores a caller-provided exclude user and uses the actor", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    searchMock.mockResolvedValue([]);
    await searchPotentialPartners(10, "ana");
    expect(searchMock).toHaveBeenCalledWith(10, "ana");
  });

  it("rejects a one-character query", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    await expect(searchPotentialPartners(10, "a")).resolves.toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });
});
