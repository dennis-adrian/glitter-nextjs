import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireAdminMock = vi.hoisted(() => vi.fn());
const requireAdminOrFestivalAdminMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const enqueueMock = vi.hoisted(() => vi.fn());
const scheduleJobsMock = vi.hoisted(() => vi.fn());
const lockFestivalRowMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  requireAdmin: requireAdminMock,
  requireAdminOrFestivalAdmin: requireAdminOrFestivalAdminMock,
}));

vi.mock("@/app/lib/reservations/locks", () => ({
  lockParticipants: vi.fn(),
  lockFestivalRow: lockFestivalRowMock,
  lockFestivalTermsDocument: vi.fn(),
  lockParticipantEligibilityRows: vi.fn(),
  lockUserRequestRows: vi.fn(),
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueReservationNotification: enqueueMock,
  scheduleReservationNotificationJobs: scheduleJobsMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    select: selectMock,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  reviewBecomeArtistRequest,
  reviewFestivalParticipationRequest,
} from "@/app/lib/user_requests/review-service";
import { userRequests, users } from "@/db/schema";

function previewSelect(row: unknown | null) {
  selectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => (row ? [row] : []),
      }),
    }),
  });
}

function reviewTx(options: {
  request: Record<string, unknown>;
  email?: string;
}) {
  const updates: unknown[] = [];
  const tx = {
    updates,
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () =>
            Object.assign(
              Promise.resolve(
                table === users
                  ? [{ id: options.request.userId, email: options.email }]
                  : [options.request],
              ),
              {
                for: async () => [options.request],
              },
            ),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        updates.push(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    })),
  };
  return tx;
}

describe("reviewFestivalParticipationRequest", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminOrFestivalAdminMock.mockReset();
    transactionMock.mockReset();
    selectMock.mockReset();
    enqueueMock.mockReset();
    scheduleJobsMock.mockReset();
    lockFestivalRowMock.mockReset();
    enqueueMock.mockResolvedValue(7);
    lockFestivalRowMock.mockResolvedValue({ id: 10 });
  });

  it("rejects unauthenticated callers without writing", async () => {
    requireAdminOrFestivalAdminMock.mockResolvedValue(null);
    const result = await reviewFestivalParticipationRequest({
      requestId: 4,
      status: "accepted",
    });
    expect(result).toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects festival participation review from a plain user", async () => {
    requireAdminOrFestivalAdminMock.mockResolvedValue(null);
    const result = await reviewFestivalParticipationRequest({
      requestId: 4,
      status: "rejected",
    });
    expect(result.success).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects an unrelated become_artist request id", async () => {
    requireAdminOrFestivalAdminMock.mockResolvedValue({
      id: 1,
      role: "admin",
    });
    previewSelect({
      id: 4,
      userId: 8,
      festivalId: 10,
      type: "become_artist",
      status: "pending",
    });
    const result = await reviewFestivalParticipationRequest({
      requestId: 4,
      status: "accepted",
    });
    expect(result).toEqual({
      success: false,
      message: "La solicitud no existe.",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects an illegal pending revert", async () => {
    requireAdminOrFestivalAdminMock.mockResolvedValue({
      id: 1,
      role: "festival_admin",
    });
    const result = await reviewFestivalParticipationRequest({
      requestId: 4,
      status: "pending",
    });
    expect(result).toEqual({ success: false, message: "Datos inválidos." });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a transition away from an already-accepted request", async () => {
    requireAdminOrFestivalAdminMock.mockResolvedValue({
      id: 1,
      role: "admin",
    });
    previewSelect({
      id: 4,
      userId: 8,
      festivalId: 10,
      type: "festival_participation",
      status: "pending",
    });
    const tx = reviewTx({
      request: {
        id: 4,
        userId: 8,
        festivalId: 10,
        type: "festival_participation",
        status: "accepted",
      },
      email: "ada@example.com",
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await reviewFestivalParticipationRequest({
      requestId: 4,
      status: "rejected",
      reason: "cupo",
    });

    expect(result).toEqual({
      success: false,
      message: "La solicitud ya no admite este cambio.",
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("accepts a pending festival participation request and enqueues durable mail", async () => {
    requireAdminOrFestivalAdminMock.mockResolvedValue({
      id: 1,
      role: "admin",
    });
    previewSelect({
      id: 4,
      userId: 8,
      festivalId: 10,
      type: "festival_participation",
      status: "pending",
    });
    const tx = reviewTx({
      request: {
        id: 4,
        userId: 8,
        festivalId: 10,
        type: "festival_participation",
        status: "pending",
      },
      email: "ada@example.com",
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await reviewFestivalParticipationRequest({
      requestId: 4,
      status: "accepted",
    });

    expect(result.success).toBe(true);
    expect(tx.update).toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: "festival_participation_approved",
        reservationId: null,
        userId: 8,
      }),
    );
    expect(scheduleJobsMock).toHaveBeenCalledWith([7]);
  });
});

describe("reviewBecomeArtistRequest", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    transactionMock.mockReset();
    selectMock.mockReset();
  });

  it("rejects festival_admin callers", async () => {
    requireAdminMock.mockResolvedValue(null);
    const result = await reviewBecomeArtistRequest({
      requestId: 4,
      status: "accepted",
    });
    expect(result).toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects an unrelated festival participation request id", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    previewSelect({
      id: 4,
      userId: 8,
      festivalId: 10,
      type: "festival_participation",
      status: "pending",
    });
    const result = await reviewBecomeArtistRequest({
      requestId: 4,
      status: "accepted",
    });
    expect(result).toEqual({
      success: false,
      message: "La solicitud no existe.",
    });
  });
});
