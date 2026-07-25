import { describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const eligibilityMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: requireAdminMock,
}));

vi.mock("@/app/lib/sanctions/reservation-eligibility", () => ({
  getReservationEligibility: eligibilityMock,
}));

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
    requireAdminMock.mockResolvedValue(null);

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

  it("rejects a blocked partner added through the admin edit action", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    eligibilityMock.mockResolvedValue({
      eligible: false,
      reason: "ban",
      sanctionIds: [30],
      message: "Bloqueado por sanción",
    });

    const update = vi.fn();
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([
                {
                  id: 10,
                  status: "pending",
                  standId: 7,
                  festivalId: 20,
                },
              ]),
            })),
          })),
        })),
      })),
      query: {
        festivals: {
          findFirst: vi.fn().mockResolvedValue({ id: 20 }),
        },
        users: {
          findFirst: vi.fn().mockResolvedValue({ id: 4, status: "verified" }),
        },
        invoices: {
          findFirst: vi.fn().mockResolvedValue({ userId: 3 }),
        },
      },
      update,
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await userRequestActions.updateReservationSimple(10, {
      status: "pending",
      partner: { participationId: undefined, userId: 4 },
    } as never);

    expect(result).toEqual({
      success: false,
      message:
        "El compañero seleccionado no puede participar en esta reserva. Bloqueado por sanción",
    });
    expect(eligibilityMock).toHaveBeenCalledWith(
      { userId: 4, festivalId: 20 },
      tx,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a reservation whose festival is missing without mutations", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    eligibilityMock.mockClear();

    const update = vi.fn();
    const insert = vi.fn();
    const deleteMutation = vi.fn();
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([
                {
                  id: 10,
                  status: "pending",
                  standId: 7,
                  festivalId: 20,
                },
              ]),
            })),
          })),
        })),
      })),
      query: {
        festivals: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      update,
      insert,
      delete: deleteMutation,
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await userRequestActions.updateReservationSimple(10, {
      status: "pending",
      partner: { participationId: undefined, userId: 4 },
    } as never);

    expect(result).toEqual({
      success: false,
      message: "El festival asociado a la reserva no existe",
    });
    expect(eligibilityMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(deleteMutation).not.toHaveBeenCalled();
  });
});
