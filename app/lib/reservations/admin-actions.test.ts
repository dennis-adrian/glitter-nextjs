import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("@/app/lib/sanctions/reservation-eligibility", () => ({
  getReservationEligibility: eligibilityMock,
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

import { createAdminReservation } from "@/app/lib/reservations/admin-actions";

describe("createAdminReservation sanction enforcement", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    fetchStandMock.mockReset();
    fetchFestivalMock.mockReset();
    fetchProfileMock.mockReset();
    eligibilityMock.mockReset();
    transactionMock.mockReset();
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

    const insert = vi.fn();
    const tx = {
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
      insert,
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await createAdminReservation({
      festivalId: 10,
      standId: 7,
      userId: 3,
      partnerId: 4,
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
    expect(insert).not.toHaveBeenCalled();
  });
});
