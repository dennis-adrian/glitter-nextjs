import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const rejectionEmailTemplateMock = vi.hoisted(() => vi.fn(() => null));
const insertStandReservationEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    query: {
      standReservations: { findFirst: findFirstMock, findMany: vi.fn() },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/app/emails/reservation-confirmation", () => ({
  default: () => null,
}));

vi.mock("@/app/emails/reservation-rejection", () => ({
  default: rejectionEmailTemplateMock,
}));

vi.mock("@/app/lib/reservations/events", () => ({
  insertStandReservationEvent: insertStandReservationEventMock,
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
    findFirstMock.mockReset();
    sendEmailMock.mockReset();
    revalidatePathMock.mockReset();
    rejectionEmailTemplateMock.mockReset();
    rejectionEmailTemplateMock.mockReturnValue(null);
    insertStandReservationEventMock.mockReset();
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

  it("still succeeds and revalidates when post-commit rejection emails throw synchronously", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    findFirstMock.mockResolvedValue({
      id: 3,
      standId: 9,
      status: "pending",
      stand: { label: "A", standNumber: 1 },
      festival: { name: "Fest" },
      participants: [
        { user: { email: "ada@example.com", displayName: "Ada" } },
      ],
    });
    transactionMock.mockResolvedValue({ changed: true });
    rejectionEmailTemplateMock.mockImplementation(() => {
      throw new Error("sync template failure");
    });
    sendEmailMock.mockImplementation(() => {
      throw new Error("sync send failure");
    });

    await expect(rejectReservation({ reservationId: 3 })).resolves.toEqual({
      success: true,
      message: "Reserva cancelada correctamente",
    });
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/dashboard/festivals/[id]/reservations",
      "page",
    );
  });

  it("uses the locked reservation status for the audit event fromStatus", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    findFirstMock.mockResolvedValue({
      id: 3,
      standId: 9,
      status: "pending",
      stand: { label: "A", standNumber: 1 },
      festival: { name: "Fest" },
      participants: [],
    });
    const tx = reservationLockTx({
      id: 3,
      standId: 9,
      status: "verification_payment",
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    await expect(rejectReservation({ reservationId: 3 })).resolves.toEqual({
      success: true,
      message: "Reserva cancelada correctamente",
    });
    expect(insertStandReservationEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        reservationId: 3,
        fromStatus: "verification_payment",
        toStatus: "rejected",
        eventType: "rejected",
      }),
    );
    expect(tx.update).toHaveBeenCalled();
  });

  it("does not insert a duplicate event when the locked reservation is already rejected", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    findFirstMock.mockResolvedValue({
      id: 3,
      standId: 9,
      status: "pending",
      stand: { label: "A", standNumber: 1 },
      festival: { name: "Fest" },
      participants: [
        { user: { email: "ada@example.com", displayName: "Ada" } },
      ],
    });
    const tx = reservationLockTx({
      id: 3,
      standId: 9,
      status: "rejected",
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    await expect(rejectReservation({ reservationId: 3 })).resolves.toEqual({
      success: true,
      message: "Reserva cancelada correctamente",
    });
    expect(insertStandReservationEventMock).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/dashboard/festivals/[id]/reservations",
      "page",
    );
  });
});

function reservationLockTx(locked: {
  id: number;
  standId: number;
  status: string;
} | null) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            for: vi.fn().mockResolvedValue(locked ? [locked] : []),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
}
