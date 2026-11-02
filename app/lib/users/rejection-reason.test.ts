import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserProfileMock = vi.hoisted(() => vi.fn());
const latestRejectionReasonMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: getCurrentUserProfileMock,
}));
vi.mock("@/app/lib/users/status-events", () => ({
  latestRejectionReason: latestRejectionReasonMock,
}));
vi.mock("@/db", () => ({ db: { marker: "db" } }));

import { loadRejectionReason } from "@/app/lib/users/rejection-reason";

// React's `cache` only memoizes inside a server request; in tests every call
// runs, which is what lets each case set its own viewer.
beforeEach(() => {
  getCurrentUserProfileMock.mockReset();
  latestRejectionReasonMock.mockReset();
  latestRejectionReasonMock.mockResolvedValue("Faltan fotos del stand.");
});

describe("loadRejectionReason", () => {
  it("returns the latest reason to the profile's owner", async () => {
    getCurrentUserProfileMock.mockResolvedValue({ id: 7, role: "user" });

    await expect(
      loadRejectionReason({ id: 7, status: "rejected" }),
    ).resolves.toBe("Faltan fotos del stand.");
    expect(latestRejectionReasonMock).toHaveBeenCalledWith(
      { marker: "db" },
      7,
    );
  });

  it("returns it to an admin looking at someone else's profile", async () => {
    getCurrentUserProfileMock.mockResolvedValue({ id: 1, role: "admin" });

    await expect(
      loadRejectionReason({ id: 7, status: "rejected" }),
    ).resolves.toBe("Faltan fotos del stand.");
  });

  it.each([
    ["another participant", { id: 8, role: "user" }],
    ["a festival admin", { id: 2, role: "festival_admin" }],
    ["nobody signed in", null],
  ])("withholds it from %s", async (_who, viewer) => {
    getCurrentUserProfileMock.mockResolvedValue(viewer);

    await expect(
      loadRejectionReason({ id: 7, status: "rejected" }),
    ).resolves.toBeNull();
    expect(latestRejectionReasonMock).not.toHaveBeenCalled();
  });

  it("reads nothing for a profile that is not rejected", async () => {
    getCurrentUserProfileMock.mockResolvedValue({ id: 7, role: "user" });

    await expect(
      loadRejectionReason({ id: 7, status: "pending" }),
    ).resolves.toBeNull();
    expect(latestRejectionReasonMock).not.toHaveBeenCalled();
  });

  it("falls back to null for rejections from before reasons were stored", async () => {
    getCurrentUserProfileMock.mockResolvedValue({ id: 7, role: "user" });
    latestRejectionReasonMock.mockResolvedValue(null);

    await expect(
      loadRejectionReason({ id: 7, status: "rejected" }),
    ).resolves.toBeNull();
  });
});
