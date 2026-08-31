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

import { cancelReservation } from "@/app/lib/reservations/admin-service";
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

function cancellationTx(reservation = pendingReservation) {
  let selectCalls = 0;
  const select = vi.fn(() => {
    selectCalls += 1;
    if (selectCalls === 1 || selectCalls === 3) {
      return selectChain([reservation], () => {
        lockCallOrder.current.push("reservation");
      });
    }
    if (selectCalls === 2 || selectCalls === 4) {
      return selectChain([{ userId: 3 }, { userId: 5 }]);
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
