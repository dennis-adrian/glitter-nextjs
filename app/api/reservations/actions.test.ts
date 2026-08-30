import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    query: {
      standReservations: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/app/emails/reservation-confirmation", () => ({
  default: () => null,
}));

vi.mock("@/app/emails/reservation-rejection", () => ({
  default: () => null,
}));

import {
  deleteReservation,
  updateReservation,
} from "@/app/api/reservations/actions";

describe("admin reservation mutations", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
  });

  it("rejects unauthenticated and festival_admin callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(deleteReservation(3)).resolves.toMatchObject({
      success: false,
    });
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(
      updateReservation(3, { status: "accepted" }),
    ).resolves.toMatchObject({ success: false });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
