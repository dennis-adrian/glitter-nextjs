import { describe, expect, it, vi } from "vitest";

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  requireAdminOrFestivalAdmin: vi.fn(),
}));

vi.mock("@/app/lib/reservations/policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/reservations/policy")>();
  return {
    ...actual,
    canMutateAdminReservations: (actor: { role?: string } | null) =>
      actor?.role === "admin",
  };
});

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/app/emails/festival-participation-approved", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/emails/festival-participation-rejected", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/emails/terms-acceptance", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/emails/reservation-confirmation", () => ({
  default: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import * as userRequestActions from "@/app/api/user_requests/actions";

describe("reservation mutation exposure", () => {
  it("rejects direct reservation editing by a non-admin caller", async () => {
    currentProfileMock.mockResolvedValue(null);

    const result = await userRequestActions.updateReservationSimple(
      10,
      {} as never,
    );

    expect(result).toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects festival_admin callers from the legacy reservation editor", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });

    const result = await userRequestActions.updateReservationSimple(
      10,
      {} as never,
    );

    expect(result).toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does not expose the obsolete reservation creation actions", () => {
    expect(userRequestActions).not.toHaveProperty("createReservation");
    expect(userRequestActions).not.toHaveProperty("updateReservation");
  });
});
