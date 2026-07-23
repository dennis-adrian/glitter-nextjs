import { beforeEach, describe, expect, it, vi } from "vitest";

const dbTransactionMock = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: {
    transaction: dbTransactionMock,
  },
}));

import {
  associateSanctionsWithActivatedFestival,
  reconcileSanctionFestivalCounting,
} from "@/app/lib/sanctions/festival-counting";

function createAssociationTransaction() {
  const insertedKeys = new Set<string>();
  const insertedValues: Array<Record<string, unknown>> = [];

  const tx = {
    query: {
      festivals: {
        findFirst: vi.fn().mockResolvedValue({
          id: 50,
          festivalType: "glitter",
          reservationsStartDate: new Date("2026-08-01T10:00:00.000Z"),
          festivalDates: [{ endDate: new Date("2026-08-03T22:00:00.000Z") }],
        }),
      },
      sanctions: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            type: "reservation_delay",
            status: "active",
            festivalScope: "global",
            approvedAt: new Date("2026-07-01T10:00:00.000Z"),
            startsAt: new Date("2026-07-01T10:00:00.000Z"),
            endsAt: null,
            reservationDelayMinutes: 120,
          },
          {
            id: 2,
            type: "ban",
            status: "active",
            festivalScope: "festicker",
            approvedAt: new Date("2026-07-01T10:00:00.000Z"),
            startsAt: new Date("2026-07-01T10:00:00.000Z"),
            endsAt: null,
            reservationDelayMinutes: null,
          },
          {
            id: 3,
            type: "ban",
            status: "active",
            festivalScope: "global",
            approvedAt: new Date("2026-07-20T10:00:00.000Z"),
            startsAt: new Date("2026-07-20T10:00:00.000Z"),
            endsAt: null,
            reservationDelayMinutes: null,
          },
        ]),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues.push(values);
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => {
              const key = `${values.sanctionId}-${values.festivalId}`;
              if (insertedKeys.has(key)) return Promise.resolve([]);
              insertedKeys.add(key);
              return Promise.resolve([{ sanctionId: values.sanctionId }]);
            }),
          })),
        };
      }),
    })),
  };

  return { tx, insertedValues };
}

describe("associateSanctionsWithActivatedFestival", () => {
  it("associates only applicable sanctions and remains idempotent", async () => {
    const { tx, insertedValues } = createAssociationTransaction();
    const input = {
      festivalId: 50,
      activatedAt: new Date("2026-07-10T10:00:00.000Z"),
    };

    const first = await associateSanctionsWithActivatedFestival(
      tx as never,
      input,
    );
    const second = await associateSanctionsWithActivatedFestival(
      tx as never,
      input,
    );

    expect(first.associatedSanctionIds).toEqual([1]);
    expect(second.associatedSanctionIds).toEqual([]);
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0]).toMatchObject({
      sanctionId: 1,
      festivalId: 50,
      countsTowardDuration: true,
      reservationEligibleAt: new Date("2026-08-01T12:00:00.000Z"),
    });
  });
});

function createReconciliationTransaction(input: {
  updateResults: Array<Array<{ id: number }>>;
  calendarDue?: Array<{
    id: number;
    status: "active" | "scheduled";
  }>;
}) {
  const updateResults = [...input.updateResults];
  const insert = vi.fn(() => ({
    values: vi.fn().mockResolvedValue(undefined),
  }));
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(updateResults.shift() ?? []),
          ),
      })),
    })),
  }));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(() => ({
              having: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    })),
  }));

  const tx = {
    update,
    insert,
    select,
    query: {
      sanctions: {
        findMany: vi.fn().mockResolvedValue(input.calendarDue ?? []),
      },
    },
  };

  return { tx, update, insert };
}

describe("reconcileSanctionFestivalCounting", () => {
  beforeEach(() => {
    dbTransactionMock.mockReset();
  });

  it("activates scheduled sanctions and records the lifecycle event once", async () => {
    const { tx, update, insert } = createReconciliationTransaction({
      updateResults: [[{ id: 9 }]],
    });
    dbTransactionMock.mockImplementation(
      async (callback: (transaction: unknown) => unknown) => callback(tx),
    );

    const result = await reconcileSanctionFestivalCounting({
      now: new Date("2026-07-20T12:00:00.000Z"),
    });

    expect(result.activatedSanctionIds).toEqual([9]);
    expect(result.expiredSanctionIds).toEqual([]);
    expect(update).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });

  it("does not log expiration when a concurrent mutation wins", async () => {
    const { tx, insert } = createReconciliationTransaction({
      updateResults: [[], []],
      calendarDue: [{ id: 11, status: "active" }],
    });
    dbTransactionMock.mockImplementation(
      async (callback: (transaction: unknown) => unknown) => callback(tx),
    );

    const result = await reconcileSanctionFestivalCounting({
      now: new Date("2026-07-20T12:00:00.000Z"),
    });

    expect(result.expiredSanctionIds).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });
});
