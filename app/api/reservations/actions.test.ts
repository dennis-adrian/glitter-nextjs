import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const applyLockedCancellationMock = vi.hoisted(() => vi.fn());
const scheduleJobsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/app/lib/reservations/admin-service", () => ({
  lockAndApplyReservationCancellation: applyLockedCancellationMock,
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  scheduleReservationNotificationJobs: scheduleJobsMock,
}));

import * as reservationActions from "@/app/api/reservations/actions";
import { rejectReservation } from "@/app/api/reservations/actions";

describe("admin reservation mutations", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    revalidatePathMock.mockReset();
    applyLockedCancellationMock.mockReset();
    scheduleJobsMock.mockReset();
  });

  it("does not export generic reservation mutators", () => {
    expect(reservationActions).not.toHaveProperty("updateReservation");
    expect(reservationActions).not.toHaveProperty("deleteReservation");
    expect(reservationActions).not.toHaveProperty("confirmReservation");
  });

  it("rejects unauthenticated and festival_admin callers for rejectReservation", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(rejectReservation({ reservationId: 3 })).resolves.toMatchObject({
      success: false,
    });
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(rejectReservation({ reservationId: 3 })).resolves.toMatchObject({
      success: false,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("delegates rejectReservation to locked cancellation", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    applyLockedCancellationMock.mockResolvedValue({ ok: true, jobIds: [9] });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({}),
    );

    await expect(
      rejectReservation({ reservationId: 3, reason: "test" }),
    ).resolves.toMatchObject({
      success: true,
    });
    expect(applyLockedCancellationMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        reservationId: 3,
        actorUserId: 1,
        eventType: "rejected",
      }),
    );
    expect(scheduleJobsMock).toHaveBeenCalledWith([9]);
  });
});
