import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const eligibilityMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: authMock,
}));

vi.mock("@/app/lib/sanctions/reservation-eligibility", () => ({
  getReservationEligibility: eligibilityMock,
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn(),
  fetchBaseProfileById: vi.fn(),
}));

vi.mock("@/app/api/stands/actions", () => ({
  fetchStandById: vi.fn(),
}));

vi.mock("@/app/lib/festivals/actions", () => ({
  fetchBaseFestival: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    query: {
      standHolds: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  confirmStandHold,
  createStandHold,
} from "@/app/lib/stands/hold-actions";

function standSelection(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          for: vi.fn().mockResolvedValue(rows),
        })),
      })),
    })),
  };
}

function holdSelection(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            for: vi.fn().mockResolvedValue(rows),
          })),
        })),
      })),
    })),
  };
}

describe("stand hold sanction enforcement", () => {
  beforeEach(() => {
    authMock.mockReset();
    eligibilityMock.mockReset();
    transactionMock.mockReset();
  });

  it("rejects a stand whose canonical festival differs from the request", async () => {
    authMock.mockResolvedValue({ id: 3, role: "artist", status: "verified" });
    const tx = {
      select: vi.fn(() =>
        standSelection([{ id: 7, status: "available", festivalId: 10 }]),
      ),
      query: { users: { findFirst: vi.fn() } },
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await createStandHold(7, 3, 99);

    expect(result).toEqual({
      success: false,
      message: "El espacio no pertenece a este festival",
    });
    expect(eligibilityMock).not.toHaveBeenCalled();
  });

  it("rejects direct hold creation when the primary participant is blocked", async () => {
    authMock.mockResolvedValue({ id: 3, role: "artist", status: "verified" });
    eligibilityMock.mockResolvedValue({
      eligible: false,
      reason: "ban",
      sanctionIds: [12],
      message: "Bloqueado por sanción",
    });
    const insert = vi.fn();
    const tx = {
      select: vi.fn(() =>
        standSelection([{ id: 7, status: "available", festivalId: 10 }]),
      ),
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({ status: "verified" }),
        },
      },
      insert,
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await createStandHold(7, 3, 10);

    expect(result).toEqual({
      success: false,
      message: "Bloqueado por sanción",
    });
    expect(eligibilityMock).toHaveBeenCalledWith(
      { userId: 3, festivalId: 10 },
      tx,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects confirmation when the selected partner is blocked", async () => {
    authMock.mockResolvedValue({ id: 3, role: "artist", status: "verified" });
    eligibilityMock.mockImplementation(({ userId }: { userId: number }) =>
      Promise.resolve(
        userId === 3
          ? { eligible: true }
          : {
              eligible: false,
              reason: "reservation_delay",
              sanctionIds: [15],
              message: "Aún no puede reservar",
            },
      ),
    );

    const insert = vi.fn();
    const select = vi
      .fn()
      .mockImplementationOnce(() =>
        holdSelection([
          {
            id: 20,
            standId: 7,
            festivalId: 10,
            standFestivalId: 10,
            standPrice: 100,
          },
        ]),
      )
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            { id: 3, status: "verified" },
            { id: 4, status: "verified" },
          ]),
        })),
      }));
    const tx = { select, insert };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await confirmStandHold(20, 3, 4);

    expect(result).toEqual({
      success: false,
      message:
        "El compañero seleccionado no puede participar en esta reserva. Aún no puede reservar",
      reservationId: undefined,
    });
    expect(eligibilityMock).toHaveBeenNthCalledWith(
      2,
      { userId: 4, festivalId: 10 },
      tx,
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
