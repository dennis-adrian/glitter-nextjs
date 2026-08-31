import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const lockReservationAggregateMock = vi.hoisted(() => vi.fn());
const releaseStandMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/app/lib/reservations/occupancy", () => ({
  releaseStandIfVacant: releaseStandMock,
}));

vi.mock("@/app/lib/reservations/partner-eligibility", () => ({
  assertReservationPartner: vi.fn(),
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: vi.fn().mockResolvedValue([]),
  enqueueReservationNotification: vi.fn(),
  scheduleReservationNotificationJobs: vi.fn(),
}));

vi.mock("@/app/lib/reservations/events", () => ({
  insertStandReservationEvent: vi.fn(),
}));

vi.mock("@/app/lib/reservations/request-registry", () => ({
  claimRequest: vi.fn().mockResolvedValue({ kind: "claimed" }),
  completeRequest: vi.fn(),
  abandonRequest: vi.fn(),
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { cancelStandHold } from "@/app/lib/reservations/hold-service";
import { standHolds } from "@/db/schema";

function holdTx(options?: { hold?: { id: number; standId: number; festivalId: number; userId: number } | null }) {
  const hold =
    options && "hold" in options
      ? options.hold
      : { id: 20, standId: 7, festivalId: 10, userId: 3 };
  let reads = 0;
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = table === standHolds && hold ? [hold] : [];
          reads += 1;
          const afterLimit = Object.assign(Promise.resolve(rows), {
            for: vi.fn(async () => (reads > 1 && hold ? [hold] : rows)),
          });
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(() => afterLimit),
          });
        },
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  };
}

describe("cancelStandHold", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    lockReservationAggregateMock.mockReset();
    releaseStandMock.mockReset();
    lockReservationAggregateMock.mockResolvedValue({
      ok: true,
      locked: { userIds: [3], standIds: [7], holdIds: [20] },
    });
    releaseStandMock.mockResolvedValue(true);
  });

  it("rejects unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    const result = await cancelStandHold({ holdId: 20 });
    expect(result).toMatchObject({ success: false, code: "UNAUTHENTICATED" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects cancelling another participant's hold", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user", status: "verified" });
    const tx = holdTx();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await cancelStandHold({ holdId: 20 });
    expect(result).toMatchObject({ success: false, code: "HOLD_NOT_OWNED" });
    expect(tx.delete).not.toHaveBeenCalled();
    expect(lockReservationAggregateMock).not.toHaveBeenCalled();
  });

  it("is idempotent when the hold is already gone", async () => {
    currentProfileMock.mockResolvedValue({ id: 3, role: "user", status: "verified" });
    const tx = holdTx({ hold: null });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await cancelStandHold({ holdId: 20 });
    expect(result.success).toBe(true);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("locks the aggregate then deletes the owned hold and releases a vacant stand", async () => {
    currentProfileMock.mockResolvedValue({ id: 3, role: "user", status: "verified" });
    const tx = holdTx();
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await cancelStandHold({ holdId: 20 });
    expect(result.success).toBe(true);
    expect(lockReservationAggregateMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        festivalId: 10,
        userIds: [3],
        standIds: [7],
        holdIds: [20],
      }),
    );
    expect(tx.delete).toHaveBeenCalled();
    expect(releaseStandMock).toHaveBeenCalledWith(tx, 7);
  });
});
