import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  insertStandReservationEvent,
  StandReservationEventIdempotencyConflictError,
} from "@/app/lib/reservations/events";
import { standReservationEvents } from "@/db/schema";

function createTx(existing?: { id: number; actorUserId: number | null }) {
  const inserted: unknown[] = [];
  const tx = {
    inserted,
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(
            table === standReservationEvents && existing ? [existing] : [],
          ),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        inserted.push(values);
        return Promise.resolve();
      },
    })),
  };
  return tx;
}

describe("insertStandReservationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips insert when reservation and idempotency key already exist", async () => {
    const tx = createTx({ id: 1, actorUserId: 8 });
    await insertStandReservationEvent(tx as never, {
      reservationId: 4,
      actorUserId: 8,
      eventType: "settlement_submitted",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects when the same reservation key was recorded by another actor", async () => {
    const tx = createTx({ id: 1, actorUserId: 99 });
    await expect(
      insertStandReservationEvent(tx as never, {
        reservationId: 4,
        actorUserId: 8,
        eventType: "settlement_submitted",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toBeInstanceOf(StandReservationEventIdempotencyConflictError);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("inserts when no idempotency key is provided", async () => {
    const tx = createTx();
    await insertStandReservationEvent(tx as never, {
      reservationId: 4,
      actorUserId: 8,
      eventType: "created",
    });
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.inserted).toEqual([
      expect.objectContaining({
        reservationId: 4,
        actorUserId: 8,
        eventType: "created",
        idempotencyKey: null,
      }),
    ]);
  });
});
