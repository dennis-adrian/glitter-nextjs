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
  lockFestivalTermsDocument: vi.fn(async () => {
    lockCallOrder.current.push("terms");
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

vi.mock("@/app/lib/sanctions/reservation-eligibility", () => ({
  getReservationEligibility: vi.fn().mockResolvedValue({ eligible: true }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { cancelReservation, updateReservationPartner } from "@/app/lib/reservations/admin-service";
import {
  lockFestivalRow,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";

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
    if (selectCalls === 1) {
      return selectChain([reservation]);
    }
    if (selectCalls === 2) {
      return selectChain([{ userId: 3 }, { userId: 5 }]);
    }
    if (selectCalls === 3) {
      return selectChain([reservation], () => {
        lockCallOrder.current.push("reservation");
      });
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
      "terms",
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
    expect(lockCallOrder.current.slice(0, 6)).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "stand",
      "reservation",
    ]);
  });
});

function partnerEditTx(options?: {
  partnerUser?: { id: number; status: string } | null;
  otherMemberships?: { reservationId: number }[];
}) {
  const reservation = {
    ...pendingReservation,
    ownerUserId: 3,
  };
  let selectCalls = 0;
  const select = vi.fn(() => {
    selectCalls += 1;
    if (selectCalls === 1 || selectCalls === 4) {
      return selectChain([reservation], () => {
        lockCallOrder.current.push("reservation");
      });
    }
    if (selectCalls === 2) {
      return selectChain([{ id: 1, userId: 3 }]);
    }
    if (selectCalls === 3) {
      return selectChain([{ userId: 3 }]);
    }
    if (selectCalls === 5) {
      return selectChain(
        options?.partnerUser === null
          ? []
          : [options?.partnerUser ?? { id: 4, status: "verified" }],
      );
    }
    return selectChain(options?.otherMemberships ?? []);
  });
  return {
    select,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
  };
}

describe("updateReservationPartner", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    insertEventMock.mockReset();
    vi.mocked(getReservationEligibility).mockReset();
    vi.mocked(getReservationEligibility).mockResolvedValue({
      eligible: true,
      reason: null,
      sanctionIds: [],
      message: "",
    } as never);
    vi.mocked(lockFestivalRow).mockClear();
    vi.mocked(lockParticipants).mockClear();
    vi.mocked(lockParticipantEligibilityRows).mockClear();
    vi.mocked(lockStandRows).mockClear();
    insertEventMock.mockResolvedValue(undefined);
  });

  it("rejects festival_admin callers", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    const result = await updateReservationPartner({
      reservationId: 9,
      partnerUserId: 4,
    });
    expect(result).toEqual({ success: false, message: "No autorizado" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("locks participants, festival, terms, eligibility, and stand before the reservation row", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = partnerEditTx();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await updateReservationPartner({
      reservationId: 9,
      partnerUserId: 4,
    });

    expect(result.success).toBe(true);
    const reservationLockAt = lockCallOrder.current.indexOf("reservation");
    expect(lockCallOrder.current.slice(0, reservationLockAt)).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "stand",
    ]);
    expect(lockParticipants).toHaveBeenCalledWith(tx, 10, [3, 4]);
    expect(lockStandRows).toHaveBeenCalledWith(tx, [7]);
    expect(tx.insert).toHaveBeenCalled();
  });

  it("rejects a sanctioned partner without writing", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    vi.mocked(getReservationEligibility).mockResolvedValue({
      eligible: false,
      reason: "ban",
      sanctionIds: [30],
      message: "Bloqueado por sanción",
    } as never);
    const tx = partnerEditTx();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await updateReservationPartner({
      reservationId: 9,
      partnerUserId: 4,
    });

    expect(result).toEqual({
      success: false,
      message:
        "El compañero seleccionado no puede participar en esta reserva. Bloqueado por sanción",
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

