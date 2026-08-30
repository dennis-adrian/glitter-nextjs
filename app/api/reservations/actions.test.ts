import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const rejectionEmailTemplateMock = vi.hoisted(() => vi.fn(() => null));

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
    transactionMock.mockResolvedValue(undefined);
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
});
