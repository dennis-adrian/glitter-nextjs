import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      standReservations: { findFirst: findFirstMock, findMany: vi.fn() },
    },
    select: vi.fn(),
  },
}));

import { fetchReservationForAdmin } from "@/app/lib/reservations/queries";

describe("reservation admin reads", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    findFirstMock.mockReset();
  });

  it("returns null for unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(fetchReservationForAdmin(3)).resolves.toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("returns null for unrelated participants", async () => {
    currentProfileMock.mockResolvedValue({ id: 9, role: "user" });
    await expect(fetchReservationForAdmin(3)).resolves.toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });
});
