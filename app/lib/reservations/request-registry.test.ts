import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canonicalizeScope,
  claimRequest,
  scopesEqual,
} from "@/app/lib/reservations/request-registry";
import { reservationRequestRegistry } from "@/db/schema";

function createRegistryTx(existing?: {
  requestKey: string;
  operation: string;
  actorUserId: number;
  scope: Record<string, unknown>;
  status: "in_progress" | "completed";
  resultIds?: Record<string, number>;
}) {
  const rows = existing ? [existing] : [];
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  const tx = {
    inserted,
    updated,
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            for: vi.fn(async () => rows),
          })),
        })),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            inserted.push({ table, values });
            return [values];
          },
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        updated.push(values);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };

  return { tx, inserted, updated, rows };
}

describe("request registry", () => {
  it("canonicalizes scope keys and dates", () => {
    expect(
      canonicalizeScope({
        partnerId: null,
        revealAt: new Date("2026-08-01T10:00:00.000Z"),
        standId: 7,
      }),
    ).toEqual({
      partnerId: null,
      revealAt: "2026-08-01T10:00:00.000Z",
      standId: 7,
    });
  });

  it("returns conflict when actor or scope mismatch", async () => {
    const { tx } = createRegistryTx({
      requestKey: "11111111-1111-4111-8111-111111111111",
      operation: "confirmStandHold",
      actorUserId: 3,
      scope: { holdId: 20, partnerId: null },
      status: "completed",
      resultIds: { reservationId: 88 },
    });

    const result = await claimRequest(tx as never, {
      requestKey: "11111111-1111-4111-8111-111111111111",
      operation: "confirmStandHold",
      actorUserId: 3,
      scope: { holdId: 21, partnerId: null },
    });

    expect(result).toEqual({ kind: "conflict" });
  });

  it("replays completed requests with matching scope", async () => {
    const { tx } = createRegistryTx({
      requestKey: "11111111-1111-4111-8111-111111111111",
      operation: "confirmStandHold",
      actorUserId: 3,
      scope: { holdId: 20, partnerId: 4 },
      status: "completed",
      resultIds: { reservationId: 88 },
    });

    const result = await claimRequest(tx as never, {
      requestKey: "11111111-1111-4111-8111-111111111111",
      operation: "confirmStandHold",
      actorUserId: 3,
      scope: { holdId: 20, partnerId: 4 },
    });

    expect(result).toEqual({
      kind: "replayed",
      resultIds: { reservationId: 88 },
    });
  });

  it("claims a fresh request key", async () => {
    const { tx, inserted } = createRegistryTx();

    const result = await claimRequest(tx as never, {
      requestKey: "22222222-2222-4222-8222-222222222222",
      operation: "createOrReplaceStandHold",
      actorUserId: 5,
      scope: { standId: 9 },
    });

    expect(result).toEqual({ kind: "claimed" });
    expect(inserted).toEqual([
      expect.objectContaining({
        table: reservationRequestRegistry,
        values: expect.objectContaining({
          requestKey: "22222222-2222-4222-8222-222222222222",
          operation: "createOrReplaceStandHold",
          actorUserId: 5,
          scope: { standId: 9 },
          status: "in_progress",
        }),
      }),
    ]);
  });

  it("compares scopes with stable key ordering", () => {
    expect(
      scopesEqual(
        { holdId: 20, partnerId: null },
        { partnerId: null, holdId: 20 },
      ),
    ).toBe(true);
  });

  it("replays completed result when a concurrent insert loses the race", async () => {
    const requestKey = "33333333-3333-4333-8333-333333333333";
    const completedRow = {
      requestKey,
      operation: "adminConfirmReservation",
      actorUserId: 9,
      scope: { reservationId: 42, partnerId: null },
      status: "completed" as const,
      resultIds: { reservationId: 42 },
    };

    let selectCalls = 0;
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              for: vi.fn(async () => {
                selectCalls += 1;
                return selectCalls === 1 ? [] : [completedRow];
              }),
            })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      })),
    };

    const result = await claimRequest(tx as never, {
      requestKey,
      operation: "adminConfirmReservation",
      actorUserId: 9,
      scope: { reservationId: 42, partnerId: null },
    });

    expect(result).toEqual({
      kind: "replayed",
      resultIds: { reservationId: 42 },
    });
    expect(selectCalls).toBe(2);
  });
});
