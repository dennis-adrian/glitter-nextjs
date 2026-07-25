import { beforeEach, describe, expect, it, vi } from "vitest";

const associateMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/sanctions/festival-counting", () => ({
  associateSanctionsWithActivatedFestival: associateMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
}));

import { transitionFestivalStatus } from "@/app/lib/festivals/status-transitions";

function createTransaction(currentStatus: "draft" | "published" | "active") {
  const forUpdate = vi
    .fn()
    .mockResolvedValue([{ id: 42, status: currentStatus }]);
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: forUpdate,
      })),
    })),
  }));
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    tx: { select, update, insert },
    forUpdate,
    update,
    insert,
  };
}

describe("transitionFestivalStatus", () => {
  beforeEach(() => {
    associateMock.mockReset();
    associateMock.mockResolvedValue({ associatedSanctionIds: [7, 8] });
  });

  it("locks the festival and skips duplicate status transitions", async () => {
    const { tx, forUpdate, update, insert } = createTransaction("published");

    const result = await transitionFestivalStatus(
      {
        festivalId: 42,
        toStatus: "published",
        actorUserId: 3,
      },
      tx as never,
    );

    expect(forUpdate).toHaveBeenCalledWith("update");
    expect(result.changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(associateMock).not.toHaveBeenCalled();
  });

  it("records one real activation and associates qualifying sanctions", async () => {
    const { tx, forUpdate, update, insert } = createTransaction("published");
    const now = new Date("2026-07-20T12:00:00.000Z");

    const result = await transitionFestivalStatus(
      {
        festivalId: 42,
        toStatus: "active",
        actorUserId: 3,
        now,
      },
      tx as never,
    );

    expect(forUpdate).toHaveBeenCalledWith("update");
    expect(update).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
    expect(associateMock).toHaveBeenCalledWith(tx, {
      festivalId: 42,
      activatedAt: now,
    });
    expect(result).toMatchObject({
      changed: true,
      fromStatus: "published",
      toStatus: "active",
      associatedSanctionIds: [7, 8],
    });
  });
});
