import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const cancelReservationMock = vi.hoisted(() => vi.fn());
const applyCancellationMock = vi.hoisted(() => vi.fn());
const scheduleJobsMock = vi.hoisted(() => vi.fn());

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
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/app/emails/reservation-confirmation", () => ({
  default: () => null,
}));

vi.mock("@/app/lib/reservations/admin-service", () => ({
  cancelReservation: cancelReservationMock,
  applyReservationCancellation: applyCancellationMock,
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  scheduleReservationNotificationJobs: scheduleJobsMock,
}));

import {
  deleteReservation,
  rejectReservation,
  updateReservation,
} from "@/app/api/reservations/actions";

describe("admin reservation mutations", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    revalidatePathMock.mockReset();
    cancelReservationMock.mockReset();
    applyCancellationMock.mockReset();
    scheduleJobsMock.mockReset();
  });

  it("rejects unauthenticated and festival_admin callers for generic updates", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(
      updateReservation(3, { status: "accepted" }),
    ).resolves.toMatchObject({ success: false });
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(
      updateReservation(3, { status: "accepted" }),
    ).resolves.toMatchObject({ success: false });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("delegates deleteReservation to cancelReservation", async () => {
    cancelReservationMock.mockResolvedValue({
      success: true,
      message: "Reserva cancelada. El espacio quedó disponible.",
    });
    await expect(deleteReservation(3)).resolves.toMatchObject({
      success: true,
    });
    expect(cancelReservationMock).toHaveBeenCalledWith({ reservationId: 3 });
  });

  it("rejects rejectReservation without a reservation object", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    await expect(
      rejectReservation({
        id: 3,
        standId: 9,
        participants: [],
      }),
    ).resolves.toMatchObject({ success: false });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("still succeeds and revalidates after a committed rejection", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    applyCancellationMock.mockResolvedValue([11]);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: async () => [
                  {
                    id: 3,
                    standId: 9,
                    festivalId: 1,
                    status: "pending",
                  },
                ],
              }),
            }),
          }),
        }),
      }),
    );

    await expect(rejectReservation({ reservationId: 3 })).resolves.toEqual({
      success: true,
      message: "Reserva cancelada correctamente",
    });
    expect(applyCancellationMock).toHaveBeenCalledOnce();
    expect(scheduleJobsMock).toHaveBeenCalledWith([11]);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/dashboard/festivals/[id]/reservations",
      "page",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/dashboard/festivals/[id]/payments",
      "page",
    );
  });
});
