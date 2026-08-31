import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const fetchStandMock = vi.hoisted(() => vi.fn());
const fetchFestivalMock = vi.hoisted(() => vi.fn());
const fetchProfileMock = vi.hoisted(() => vi.fn());
const eligibilityMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/api/stands/actions", () => ({
  fetchStandById: fetchStandMock,
}));

vi.mock("@/app/lib/festivals/actions", () => ({
  fetchBaseFestival: fetchFestivalMock,
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchBaseProfileById: fetchProfileMock,
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/lib/reservations/locks", () => ({
  lockFestivalRow: vi.fn(),
  lockParticipants: vi.fn(),
  lockParticipantEligibilityRows: vi.fn(),
  lockStandRows: vi.fn(),
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn(),
  scheduleReservationNotificationJobs: vi.fn(),
}));

vi.mock("@/app/lib/sanctions/reservation-eligibility", () => ({
  getReservationEligibility: eligibilityMock,
}));

vi.mock("@/app/lib/reservations/request-registry", () => ({
  claimRequest: vi.fn().mockResolvedValue({ kind: "claimed" }),
  completeRequest: vi.fn(),
  abandonRequest: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  lockFestivalRow,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";
import { createAdminReservation } from "@/app/lib/reservations/admin-actions";

function availableStandTx() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([
              {
                id: 7,
                festivalId: 10,
                status: "available",
                price: 100,
              },
            ]),
          })),
        })),
      })),
    })),
    insert: vi.fn(),
  };
}

describe("createAdminReservation sanction enforcement", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    fetchStandMock.mockReset();
    fetchFestivalMock.mockReset();
    fetchProfileMock.mockReset();
    eligibilityMock.mockReset();
    transactionMock.mockReset();
    vi.mocked(lockFestivalRow).mockReset();
    vi.mocked(lockParticipants).mockReset();
    vi.mocked(lockParticipantEligibilityRows).mockReset();
    vi.mocked(lockStandRows).mockReset();
  });

  it("rejects an administratively assigned partner with a blocking sanction", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    fetchStandMock.mockResolvedValue({ id: 7, festivalId: 10 });
    fetchFestivalMock.mockResolvedValue({
      id: 10,
      reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
    });
    fetchProfileMock.mockResolvedValue({ status: "verified" });
    eligibilityMock.mockImplementation(({ userId }: { userId: number }) =>
      Promise.resolve(
        userId === 3
          ? { eligible: true }
          : {
              eligible: false,
              reason: "ban",
              sanctionIds: [22],
              message: "Bloqueado por sanción",
            },
      ),
    );

    const tx = availableStandTx();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await createAdminReservation({
      festivalId: 10,
      standId: 7,
      ownerUserId: 3,
      partnerId: 4,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({
      success: false,
      message:
        "El compañero seleccionado no puede participar en esta reserva. Bloqueado por sanción",
    });
    expect(eligibilityMock).toHaveBeenNthCalledWith(
      2,
      { userId: 4, festivalId: 10 },
      tx,
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("locks festival and participant eligibility rows before the stand", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    fetchStandMock.mockResolvedValue({ id: 7, festivalId: 10 });
    fetchFestivalMock.mockResolvedValue({
      id: 10,
      reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
    });
    fetchProfileMock.mockResolvedValue({ status: "verified" });
    const order: string[] = [];
    vi.mocked(lockParticipants).mockImplementation(async () => {
      order.push("participants");
    });
    vi.mocked(lockFestivalRow).mockImplementation(async () => {
      order.push("festival");
      return null;
    });
    vi.mocked(lockParticipantEligibilityRows).mockImplementation(async () => {
      order.push("eligibilityRows");
    });
    vi.mocked(lockStandRows).mockImplementation(async () => {
      order.push("stand");
      return [];
    });
    eligibilityMock.mockImplementation(async () => {
      order.push("eligibilityCheck");
      return {
        eligible: false,
        reason: "ban",
        sanctionIds: [22],
        message: "Bloqueado por sanción",
      };
    });

    const tx = availableStandTx();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    await createAdminReservation({
      festivalId: 10,
      standId: 7,
      ownerUserId: 3,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(order).toEqual([
      "participants",
      "festival",
      "eligibilityRows",
      "stand",
      "eligibilityCheck",
    ]);
    expect(lockParticipants).toHaveBeenCalledWith(tx, 10, [3]);
    expect(lockParticipantEligibilityRows).toHaveBeenCalledWith(tx, 10, [3]);
    expect(lockStandRows).toHaveBeenCalledWith(tx, [7]);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
