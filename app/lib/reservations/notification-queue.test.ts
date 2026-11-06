import { beforeEach, describe, expect, it, vi } from "vitest";

const mirrorMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/notifications/mirrors/reservation-jobs", () => ({
  mirrorReservationNotificationJobs: mirrorMock,
}));

import {
  enqueueReservationNotification,
  enqueueReservationNotifications,
} from "@/app/lib/reservations/notification-queue";

/** A transaction whose job table remembers keys, like the unique index. */
function fakeTx() {
  const jobs = new Map<string, number>();
  let nextId = 100;
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((values: { deduplicationKey: string }) => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (jobs.has(values.deduplicationKey)) return [];
            const id = nextId++;
            jobs.set(values.deduplicationKey, id);
            return [{ id }];
          }),
        })),
      })),
    })),
    query: {
      reservationNotificationJobs: {
        findFirst: vi.fn(async () => {
          const [id] = [...jobs.values()];
          return id == null ? undefined : { id };
        }),
      },
    },
  };
  return tx;
}

const base = {
  kind: "proof_submitted" as const,
  reservationId: 7,
  userId: 10,
  recipientEmail: "ana@example.test",
  audience: "participant" as const,
};

describe("enqueueReservationNotification", () => {
  beforeEach(() => {
    mirrorMock.mockReset();
  });

  it("writes the inbox copy of a job it just queued", async () => {
    const tx = fakeTx();
    const id = await enqueueReservationNotification(tx as never, {
      ...base,
      payload: { invoiceId: 3 },
    });

    expect(id).toBe(100);
    expect(mirrorMock).toHaveBeenCalledWith(tx, [
      {
        jobId: 100,
        kind: "proof_submitted",
        reservationId: 7,
        userId: 10,
        payload: { reservationId: 7, invoiceId: 3 },
        audience: "participant",
        actorUserId: null,
      },
    ]);
  });

  it("writes none for an email the dedupe key swallowed", async () => {
    const tx = fakeTx();
    await enqueueReservationNotification(tx as never, base);
    mirrorMock.mockReset();

    await expect(
      enqueueReservationNotification(tx as never, base),
    ).resolves.toBe(100);
    expect(mirrorMock).toHaveBeenCalledWith(tx, []);
  });

  it("writes none without a person to file it for, or an address to send to", async () => {
    const tx = fakeTx();
    await enqueueReservationNotification(tx as never, {
      ...base,
      userId: null,
    });
    expect(mirrorMock).toHaveBeenLastCalledWith(tx, []);

    await expect(
      enqueueReservationNotification(tx as never, {
        ...base,
        recipientEmail: "  ",
        deduplicationKey: "other",
      }),
    ).resolves.toBeNull();
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(mirrorMock).toHaveBeenLastCalledWith(tx, []);
  });
});

describe("enqueueReservationNotifications", () => {
  beforeEach(() => {
    mirrorMock.mockReset();
  });

  it("queues every email first, then writes their copies in one batch", async () => {
    const tx = fakeTx();
    const ids = await enqueueReservationNotifications(tx as never, [
      base,
      {
        ...base,
        userId: 99,
        recipientEmail: "admin@example.test",
        deduplicationKey: "proof_submitted:7:admin:99",
        audience: "admin",
        actorUserId: 10,
      },
    ]);

    expect(ids).toEqual([100, 101]);
    expect(mirrorMock).toHaveBeenCalledTimes(1);
    const [, jobs] = mirrorMock.mock.calls[0]!;
    expect(jobs).toMatchObject([
      { jobId: 100, userId: 10, audience: "participant" },
      { jobId: 101, userId: 99, audience: "admin", actorUserId: 10 },
    ]);
  });
});
