import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const enqueueMock = vi.hoisted(() => vi.fn());
const scheduleJobsMock = vi.hoisted(() => vi.fn());
const insertEventMock = vi.hoisted(() => vi.fn());
const lockCallOrder = vi.hoisted(() => ({ current: [] as string[] }));
const lockReservationAggregateMock = vi.hoisted(() => vi.fn());
const assertPartnerMock = vi.hoisted(() => vi.fn());
const releaseStandMock = vi.hoisted(() => vi.fn());
const claimRequestMock = vi.hoisted(() => vi.fn());
const completeRequestMock = vi.hoisted(() => vi.fn());
const abandonRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("@/app/lib/reservations/locks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/reservations/locks")>();
  return {
    ...actual,
    lockReservationAggregate: lockReservationAggregateMock,
  };
});

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueReservationNotification: enqueueMock,
  scheduleReservationNotificationJobs: scheduleJobsMock,
}));

vi.mock("@/app/lib/reservations/events", () => ({
  insertStandReservationEvent: insertEventMock,
}));

vi.mock("@/app/lib/reservations/partner-eligibility", () => ({
  assertReservationPartner: assertPartnerMock,
}));

vi.mock("@/app/lib/reservations/occupancy", () => ({
  releaseStandIfVacant: releaseStandMock,
}));

vi.mock("@/app/lib/reservations/request-registry", () => ({
  claimRequest: claimRequestMock,
  completeRequest: completeRequestMock,
  abandonRequest: abandonRequestMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  applyReservationCancellation,
  cancelReservation,
  extendReservationPaymentDeadline,
  lockAndApplyReservationCancellation,
  updateReservationPartner,
} from "@/app/lib/reservations/admin-service";
import {
  invoices,
  reservationParticipants,
  scheduledTasks,
  standReservations,
  stands,
  users,
} from "@/db/schema";

const pendingReservation = {
  id: 9,
  standId: 7,
  festivalId: 10,
  status: "pending",
  ownerUserId: 3,
};

function tableAwareTx(options?: {
  reservation?: typeof pendingReservation;
  participants?: Array<{ userId: number }>;
  lockedParticipants?: Array<{ userId: number }>;
  invoices?: Array<{
    id: number;
    userId: number;
    status?: string;
    reservationId?: number;
  }>;
  tasks?: Array<{
    id: number;
    dueDate: Date;
    completedAt: Date | null;
    taskType?: string;
  }>;
  standCategory?: string;
}) {
  const reservation = options?.reservation ?? pendingReservation;
  let participantReads = 0;
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => {
        if (table === standReservations) {
          const rows = [reservation];
          const afterLimit = Object.assign(Promise.resolve(rows), {
            for: vi.fn(async () => {
              lockCallOrder.current.push("reservation");
              return rows;
            }),
          });
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(() => afterLimit),
          });
        }
        if (table === reservationParticipants) {
          participantReads += 1;
          const rows =
            participantReads > 1 && options?.lockedParticipants
              ? options.lockedParticipants
              : (options?.participants ?? [{ userId: 3 }, { userId: 5 }]);
          return Promise.resolve(rows);
        }
        if (table === invoices) {
          const rows = options?.invoices ?? [
            { id: 1, userId: 3, status: "pending", reservationId: reservation.id },
          ];
          const afterLimit = Object.assign(Promise.resolve(rows), {
            for: vi.fn(async () => rows),
          });
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(() => afterLimit),
            for: vi.fn(async () => rows),
          });
        }
        if (table === scheduledTasks) {
          const rows = options?.tasks ?? [];
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(() => Promise.resolve(rows)),
            for: vi.fn(async () => rows),
          });
        }
        if (table === stands) {
          const rows = [{ standCategory: options?.standCategory ?? "illustration" }];
          const afterLimit = Object.assign(Promise.resolve(rows), {
            for: vi.fn(async () => rows),
          });
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(() => afterLimit),
          });
        }
        if (table === users) {
          return Promise.resolve([
            { id: 3, email: "owner@example.com" },
            { id: 5, email: "partner@example.com" },
          ]);
        }
        return Promise.resolve([]);
      },
    }),
  }));
  return {
    select,
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
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
    lockReservationAggregateMock.mockReset();
    releaseStandMock.mockReset();
    enqueueMock.mockResolvedValue(42);
    insertEventMock.mockResolvedValue(undefined);
    releaseStandMock.mockResolvedValue(true);
    lockReservationAggregateMock.mockImplementation(async () => {
      lockCallOrder.current.push(
        "advisory",
        "festival",
        "terms",
        "eligibility",
        "stand",
      );
      return {
        ok: true,
        locked: {
          festivalId: 10,
          userIds: [3, 5],
          standIds: [7],
          holdIds: [],
          reservationIds: [9],
          invoiceIds: [1],
          paymentIds: [],
          submissionIds: [],
          scheduledTaskIds: [],
          participantsByReservationId: new Map([[9, [3, 5]]]),
        },
      };
    });
  });

  it("locks festival, user_requests/users, and stand before the reservation row", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = tableAwareTx();
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
    expect(lockReservationAggregateMock).toHaveBeenCalled();
    expect(insertEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventType: "deleted" }),
    );
  });

  it("re-checks reservation status after locks and skips an already-rejected row", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = tableAwareTx({
      reservation: { ...pendingReservation, status: "rejected" },
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

describe("lockAndApplyReservationCancellation rejected event", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    enqueueMock.mockReset();
    insertEventMock.mockReset();
    lockReservationAggregateMock.mockReset();
    releaseStandMock.mockReset();
    enqueueMock.mockResolvedValue(42);
    insertEventMock.mockResolvedValue(undefined);
    releaseStandMock.mockResolvedValue(true);
    lockReservationAggregateMock.mockImplementation(async () => {
      lockCallOrder.current.push(
        "advisory",
        "festival",
        "terms",
        "eligibility",
        "stand",
      );
      return { ok: true, locked: { userIds: [3, 5], standIds: [7] } };
    });
  });

  it("locks festival, participants, and stand before the reservation row", async () => {
    const tx = tableAwareTx();

    const result = await lockAndApplyReservationCancellation(tx as never, {
      reservationId: 9,
      actorUserId: 1,
      eventType: "rejected",
      reason: "fuera de reglamento",
    });

    expect(result).toEqual({ ok: true, jobIds: [42, 42] });
    const reservationLockAt = lockCallOrder.current.indexOf("reservation");
    expect(reservationLockAt).toBeGreaterThan(-1);
    expect(lockCallOrder.current.slice(0, reservationLockAt)).toEqual([
      "advisory",
      "festival",
      "terms",
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
    const tx = tableAwareTx({
      participants: [{ userId: 3 }, { userId: 5 }],
      lockedParticipants: [{ userId: 3 }, { userId: 5 }, { userId: 7 }],
    });

    const result = await lockAndApplyReservationCancellation(tx as never, {
      reservationId: 9,
      actorUserId: 1,
      eventType: "rejected",
    });

    expect(result).toEqual({
      ok: false,
      message: "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(insertEventMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe("applyReservationCancellation writes without re-locking", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    enqueueMock.mockReset();
    insertEventMock.mockReset();
    lockReservationAggregateMock.mockReset();
    releaseStandMock.mockReset();
    enqueueMock.mockResolvedValue(42);
    insertEventMock.mockResolvedValue(undefined);
    releaseStandMock.mockResolvedValue(true);
  });

  it("updates reservation, invoices, and vacant stands without acquiring aggregate locks", async () => {
    const tx = tableAwareTx({ participants: [{ userId: 3 }, { userId: 5 }] });

    await applyReservationCancellation(tx as never, {
      reservation: pendingReservation,
      actorUserId: 1,
      eventType: "rejected",
      participantUserIds: [3, 5],
    });

    expect(lockReservationAggregateMock).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(releaseStandMock).toHaveBeenCalledWith(tx, 7);
    expect(enqueueMock).toHaveBeenCalledTimes(2);
  });
});

describe("updateReservationPartner", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    insertEventMock.mockReset();
    lockReservationAggregateMock.mockReset();
    assertPartnerMock.mockReset();
    insertEventMock.mockResolvedValue(undefined);
    assertPartnerMock.mockResolvedValue(null);
    lockReservationAggregateMock.mockImplementation(async () => {
      lockCallOrder.current.push(
        "advisory",
        "festival",
        "terms",
        "eligibility",
        "stand",
      );
      return { ok: true, locked: { userIds: [3, 4], standIds: [7] } };
    });
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
    const tx = tableAwareTx({ participants: [{ userId: 3 }] });
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
    expect(assertPartnerMock).toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalled();
  });

  it("rejects an ineligible partner without writing", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    assertPartnerMock.mockResolvedValue({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
      message:
        "La persona que elegiste no puede participar en esta reserva. Bloqueado por sanción",
    });
    const tx = tableAwareTx({ participants: [{ userId: 3 }] });
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
        "La persona que elegiste no puede participar en esta reserva. Bloqueado por sanción",
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects a partner who already has another festival reservation without writing", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    assertPartnerMock.mockResolvedValue({
      success: false,
      code: "PARTNER_ALREADY_RESERVED",
      message: "La persona que elegiste ya tiene una reserva en este festival",
    });
    const tx = tableAwareTx({ participants: [{ userId: 3 }] });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await updateReservationPartner({
      reservationId: 9,
      partnerUserId: 4,
    });

    expect(result).toEqual({
      success: false,
      message: "La persona que elegiste ya tiene una reserva en este festival",
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("removes a partner without deleting the owner participant", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = tableAwareTx({
      participants: [{ userId: 3 }, { userId: 4 }],
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await updateReservationPartner({
      reservationId: 9,
      partnerUserId: null,
    });

    expect(result).toEqual({
      success: true,
      message: "Compañero actualizado",
    });
    expect(tx.delete).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(insertEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        reservationId: 9,
        payload: { partnerUserId: null },
      }),
    );
  });
});

describe("extendReservationPaymentDeadline", () => {
  const futureDueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    lockReservationAggregateMock.mockReset();
    claimRequestMock.mockReset();
    completeRequestMock.mockReset();
    abandonRequestMock.mockReset();
    enqueueMock.mockResolvedValue(42);
    insertEventMock.mockResolvedValue(undefined);
    claimRequestMock.mockResolvedValue({ kind: "claimed" });
    lockReservationAggregateMock.mockImplementation(async () => {
      lockCallOrder.current.push(
        "advisory",
        "festival",
        "terms",
        "eligibility",
        "stand",
      );
      return {
        ok: true,
        locked: {
          festivalId: 10,
          userIds: [3],
          standIds: [7],
          holdIds: [],
          reservationIds: [9],
          invoiceIds: [1],
          paymentIds: [],
          submissionIds: [],
          scheduledTaskIds: [5],
          participantsByReservationId: new Map([[9, [3]]]),
        },
      };
    });
  });

  it("rejects unauthenticated and non-admin callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(
      extendReservationPaymentDeadline({
        reservationId: 9,
        dueAt: futureDueAt,
      }),
    ).resolves.toEqual({
      success: false,
      message: "No tenés permisos para realizar esta acción",
    });

    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(
      extendReservationPaymentDeadline({
        reservationId: 9,
        dueAt: futureDueAt,
      }),
    ).resolves.toEqual({
      success: false,
      message: "No tenés permisos para realizar esta acción",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a past due date without writing", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const result = await extendReservationPaymentDeadline({
      reservationId: 9,
      dueAt: new Date(Date.now() - 60_000),
    });
    expect(result).toEqual({
      success: false,
      message: "La nueva fecha debe ser futura",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("updates invoice due_at and the active scheduled task together", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const taskUpdateSets: unknown[] = [];
    const tx = tableAwareTx({
      participants: [{ userId: 3 }],
      invoices: [
        { id: 1, userId: 3, status: "pending", reservationId: 9 },
      ],
      tasks: [
        {
          id: 5,
          dueDate: new Date(Date.now() + 60_000),
          completedAt: null,
          taskType: "stand_reservation",
        },
      ],
    });
    tx.update = vi.fn(() => ({
      set: vi.fn((payload: unknown) => {
        taskUpdateSets.push(payload);
        return { where: vi.fn().mockResolvedValue([]) };
      }),
    }));
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await extendReservationPaymentDeadline({
      reservationId: 9,
      dueAt: futureDueAt,
    });

    const expectedReminderTime = new Date(
      futureDueAt.getTime() - 24 * 60 * 60 * 1000,
    );

    expect(result).toEqual({
      success: true,
      message: "Plazo de pago extendido",
    });
    expect(lockCallOrder.current.slice(0, 5)).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "stand",
    ]);
    expect(tx.update).toHaveBeenCalled();
    expect(taskUpdateSets).toContainEqual(
      expect.objectContaining({
        dueDate: futureDueAt,
        reminderTime: expectedReminderTime,
        reminderSentAt: null,
        ranAfterDueDate: false,
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: "deadline_extended",
        reservationId: 9,
      }),
    );
    expect(enqueueMock).toHaveBeenCalled();
    expect(completeRequestMock).toHaveBeenCalled();
    expect(scheduleJobsMock).toHaveBeenCalledWith([42, 42]);
  });

  it("inserts a new scheduled task with reminder fields when no active task exists", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const insertedTaskValues: unknown[] = [];
    const tx = tableAwareTx({
      participants: [{ userId: 3 }],
      invoices: [
        { id: 1, userId: 3, status: "pending", reservationId: 9 },
      ],
      tasks: [
        {
          id: 5,
          dueDate: new Date(Date.now() + 60_000),
          completedAt: new Date(),
          taskType: "stand_reservation",
        },
      ],
    });
    tx.insert = vi.fn(() => ({
      values: vi.fn((payload: unknown) => {
        insertedTaskValues.push(payload);
        return Promise.resolve([]);
      }),
    }));
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await extendReservationPaymentDeadline({
      reservationId: 9,
      dueAt: futureDueAt,
    });

    const expectedReminderTime = new Date(
      futureDueAt.getTime() - 24 * 60 * 60 * 1000,
    );

    expect(result).toEqual({
      success: true,
      message: "Plazo de pago extendido",
    });
    expect(insertedTaskValues).toContainEqual(
      expect.objectContaining({
        dueDate: futureDueAt,
        reminderTime: expectedReminderTime,
        profileId: 3,
        reservationId: 9,
        taskType: "stand_reservation",
      }),
    );
    expect(
      (insertedTaskValues[0] as { reminderSentAt?: unknown }).reminderSentAt,
    ).toBeUndefined();
  });
});
