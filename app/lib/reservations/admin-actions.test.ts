import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const fetchStandMock = vi.hoisted(() => vi.fn());
const fetchFestivalMock = vi.hoisted(() => vi.fn());
const fetchProfileMock = vi.hoisted(() => vi.fn());
const eligibilityMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const lockReservationAggregateMock = vi.hoisted(() => vi.fn());
const assertPartnerMock = vi.hoisted(() => vi.fn());
const occupancyMock = vi.hoisted(() => vi.fn());

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
  lockReservationAggregate: lockReservationAggregateMock,
  lockParticipantsBeforeRegistryClaim: vi.fn(),
}));

vi.mock("@/app/lib/reservations/occupancy", () => ({
  standHasLiveOccupancy: occupancyMock,
}));

vi.mock("@/app/lib/reservations/partner-eligibility", () => ({
  assertReservationPartner: assertPartnerMock,
}));

vi.mock("@/app/lib/reservations/events", () => ({
  insertStandReservationEvent: vi.fn(),
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

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

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
                standCategory: "illustration",
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
    lockReservationAggregateMock.mockReset();
    assertPartnerMock.mockReset();
    occupancyMock.mockReset();
    occupancyMock.mockResolvedValue(false);
    lockReservationAggregateMock.mockResolvedValue({ ok: true, locked: {} });
    assertPartnerMock.mockResolvedValue(null);
    eligibilityMock.mockResolvedValue({ eligible: true, message: "" });
  });

  it("rejects an administratively assigned partner with a blocking sanction", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    fetchStandMock.mockResolvedValue({ id: 7, festivalId: 10 });
    fetchFestivalMock.mockResolvedValue({
      id: 10,
      reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
    });
    fetchProfileMock.mockResolvedValue({ status: "verified" });
    assertPartnerMock.mockResolvedValue({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
      message:
        "La persona que elegiste no puede participar en esta reserva. Bloqueado por sanción",
    });

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
        "La persona que elegiste no puede participar en esta reserva. Bloqueado por sanción",
    });
    expect(assertPartnerMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        partnerUserId: 4,
        ownerUserId: 3,
        mode: "admin",
      }),
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("locks the canonical aggregate before occupancy and eligibility checks", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    fetchStandMock.mockResolvedValue({ id: 7, festivalId: 10 });
    fetchFestivalMock.mockResolvedValue({
      id: 10,
      reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
    });
    fetchProfileMock.mockResolvedValue({ status: "verified" });
    const order: string[] = [];
    lockReservationAggregateMock.mockImplementation(async () => {
      order.push("aggregate");
      return { ok: true, locked: {} };
    });
    occupancyMock.mockImplementation(async () => {
      order.push("occupancy");
      return false;
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

    expect(order).toEqual(["aggregate", "occupancy", "eligibilityCheck"]);
    expect(lockReservationAggregateMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        festivalId: 10,
        userIds: [3],
        standIds: [7],
      }),
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
