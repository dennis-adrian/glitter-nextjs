import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const enqueueMock = vi.hoisted(() => vi.fn());
const scheduleJobsMock = vi.hoisted(() => vi.fn());
const insertEventMock = vi.hoisted(() => vi.fn());
const lockCallOrder = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("@/app/lib/reservations/locks", () => ({
  lockFestivalRow: vi.fn(async () => {
    lockCallOrder.current.push("festival");
  }),
  lockParticipantEligibilityRows: vi.fn(async () => {
    lockCallOrder.current.push("eligibility");
  }),
  lockParticipants: vi.fn(async () => {
    lockCallOrder.current.push("advisory");
  }),
  lockStandRows: vi.fn(async () => {
    lockCallOrder.current.push("stand");
  }),
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueReservationNotification: enqueueMock,
  scheduleReservationNotificationJobs: scheduleJobsMock,
}));

vi.mock("@/app/lib/reservations/events", () => ({
  insertStandReservationEvent: insertEventMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  applyReservationCancellation,
  cancelReservation,
  lockAndApplyReservationCancellation,
} from "@/app/lib/reservations/admin-service";
import {
  lockFestivalRow,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";

const pendingReservation = {
  id: 9,
  standId: 7,
  festivalId: 10,
  status: "pending",
};

function selectChain(rows: unknown[], onForUpdate?: () => void) {
  const afterLimit = Object.assign(Promise.resolve(rows), {
    for: vi.fn(async () => {
      onForUpdate?.();
      return rows;
    }),
  });
  const thenable = Object.assign(Promise.resolve(rows), {
    limit: vi.fn(() => afterLimit),
  });
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => thenable),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => thenable),
      })),
    })),
  };
}

function cancellationTx(
  reservation = pendingReservation,
  participantReads?: Array<Array<{ userId: number }>>,
) {
  let selectCalls = 0;
  const defaultParticipants = [{ userId: 3 }, { userId: 5 }];
  const select = vi.fn(() => {
    selectCalls += 1;
    if (selectCalls === 1 || selectCalls === 3) {
      return selectChain([reservation], () => {
        lockCallOrder.current.push("reservation");
      });
    }
    if (selectCalls === 2 || selectCalls === 4) {
      const readIndex = selectCalls === 2 ? 0 : 1;
      return selectChain(participantReads?.[readIndex] ?? defaultParticipants);
    }
    return selectChain([{ id: 3, email: "owner@example.com" }]);
  });
  return {
    select,
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
  };
}

describe("cancelReservation lock ordering", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    vi.mocked(lockFestivalRow).mockClear();
    vi.mocked(lockParticipants).mockClear();
    vi.mocked(lockParticipantEligibilityRows).mockClear();
    vi.mocked(lockStandRows).mockClear();
    enqueueMock.mockResolvedValue(42);
    insertEventMock.mockResolvedValue(undefined);
  });

  it("locks festival, user_requests/users, and stand before the reservation row", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = cancellationTx();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await cancelReservation({ reservationId: 9 });

    expect(result).toEqual({
      success: true,
      message: "Reserva cancelada. El espacio quedó disponible.",
    });
    const reservationLockAt = lockCallOrder.current.indexOf("reservation");
    expect(reservationLockAt).toBeGreaterThan(-1);
    expect(lockCallOrder.current.slice(0, reservationLockAt)).toEqual([
      "advisory",
      "festival",
      "eligibility",
      "stand",
    ]);
    expect(lockParticipants).toHaveBeenCalledWith(tx, 10, [3, 5]);
    expect(lockParticipantEligibilityRows).toHaveBeenCalledWith(tx, 10, [3, 5]);
    expect(lockStandRows).toHaveBeenCalledWith(tx, [7]);
    expect(insertEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventType: "deleted" }),
    );
  });

  it("re-checks reservation status after locks and skips an already-rejected row", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = cancellationTx({
      ...pendingReservation,
      status: "rejected",
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await cancelReservation({ reservationId: 9 });

    expect(result.success).toBe(true);
    expect(tx.update).not.toHaveBeenCalled();
    expect(lockCallOrder.current.slice(0, 5)).toEqual([
      "advisory",
      "festival",
      "eligibility",
      "stand",
      "reservation",
    ]);
  });
});

describe("lockAndApplyReservationCancellation rejected event", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    enqueueMock.mockReset();
    insertEventMock.mockReset();
    vi.mocked(lockFestivalRow).mockClear();
    vi.mocked(lockParticipants).mockClear();
    vi.mocked(lockParticipantEligibilityRows).mockClear();
    vi.mocked(lockStandRows).mockClear();
    enqueueMock.mockResolvedValue(42);
    insertEventMock.mockResolvedValue(undefined);
  });

  it("locks festival, participants, and stand before the reservation row", async () => {
    const tx = cancellationTx();

    const result = await lockAndApplyReservationCancellation(tx as never, {
      reservationId: 9,
      actorUserId: 1,
      eventType: "rejected",
      reason: "fuera de reglamento",
    });

    expect(result).toEqual({ ok: true, jobIds: [42] });
    const reservationLockAt = lockCallOrder.current.indexOf("reservation");
    expect(reservationLockAt).toBeGreaterThan(-1);
    expect(lockCallOrder.current.slice(0, reservationLockAt)).toEqual([
      "advisory",
      "festival",
      "eligibility",
      "stand",
    ]);
    expect(insertEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: "rejected",
        payload: { reason: "fuera de reglamento" },
      }),
    );
  });

  it("does not cancel when the participant set changes between the preview and reservation-locked reads", async () => {
    const tx = cancellationTx(pendingReservation, [
      [{ userId: 3 }, { userId: 5 }],
      [{ userId: 3 }, { userId: 5 }, { userId: 7 }],
    ]);

    const result = await lockAndApplyReservationCancellation(tx as never, {
      reservationId: 9,
      actorUserId: 1,
      eventType: "rejected",
    });

    expect(result).toEqual({
      ok: false,
      message: "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
    });
    expect(lockParticipants).toHaveBeenCalledTimes(1);
    expect(lockParticipants).toHaveBeenCalledWith(tx, 10, [3, 5]);
    expect(lockParticipants).not.toHaveBeenCalledWith(
      tx,
      10,
      expect.arrayContaining([7]),
    );
    const reservationLockAt = lockCallOrder.current.indexOf("reservation");
    expect(reservationLockAt).toBeGreaterThan(-1);
    expect(lockCallOrder.current.slice(0, reservationLockAt)).toEqual([
      "advisory",
      "festival",
      "eligibility",
      "stand",
    ]);
    expect(tx.update).not.toHaveBeenCalled();
    expect(insertEventMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe("applyReservationCancellation lock ordering", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    enqueueMock.mockReset();
    insertEventMock.mockReset();
    vi.mocked(lockFestivalRow).mockClear();
    vi.mocked(lockParticipants).mockClear();
    vi.mocked(lockParticipantEligibilityRows).mockClear();
    vi.mocked(lockStandRows).mockClear();
    enqueueMock.mockResolvedValue(42);
    insertEventMock.mockResolvedValue(undefined);
  });

  it("locks participants, festival, eligibility, and stand in canonical order", async () => {
    const tx = {
      select: vi
        .fn()
        .mockImplementationOnce(() =>
          selectChain([{ userId: 3 }, { userId: 5 }]),
        )
        .mockImplementationOnce(() =>
          selectChain([{ id: 3, email: "owner@example.com" }]),
        ),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
    };

    await applyReservationCancellation(tx as never, {
      reservation: pendingReservation,
      actorUserId: 1,
      eventType: "rejected",
    });

    expect(lockCallOrder.current).toEqual([
      "advisory",
      "festival",
      "eligibility",
      "stand",
    ]);
    expect(lockParticipants).toHaveBeenCalledWith(tx, 10, [3, 5]);
    expect(lockParticipantEligibilityRows).toHaveBeenCalledWith(tx, 10, [3, 5]);
  });

  it("uses a provided reservation-locked participant set instead of a second membership read", async () => {
    const tx = {
      select: vi.fn().mockImplementationOnce(() =>
        selectChain([
          { id: 3, email: "owner@example.com" },
          { id: 7, email: "added@example.com" },
        ]),
      ),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
      })),
    };

    await applyReservationCancellation(tx as never, {
      reservation: pendingReservation,
      actorUserId: 1,
      eventType: "rejected",
      participantUserIds: [3, 5],
    });

    expect(lockParticipants).toHaveBeenCalledWith(tx, 10, [3, 5]);
    expect(lockParticipantEligibilityRows).toHaveBeenCalledWith(tx, 10, [3, 5]);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 3 }),
    );
  });
});
