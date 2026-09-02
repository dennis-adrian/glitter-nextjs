import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lockUserRows: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/app/lib/reservations/locks", () => ({
  lockUserRows: mocks.lockUserRows,
}));

vi.mock("@/db", () => ({
  db: { transaction: mocks.transaction },
}));

import { adjustCreditAccount } from "@/app/lib/credits/service";

describe("credit mutation deletion guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects posting after locking a user with an active deletion", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: 9 }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const insert = vi.fn();
    const tx = { select, insert };
    mocks.transaction.mockImplementation(async (run) => run(tx));

    const result = await adjustCreditAccount({
      userId: 42,
      amount: 10,
      reason: "test",
      idempotencyKey: "4c96e45e-9eb9-4f0d-a340-88c25e49edba",
    });

    expect(mocks.lockUserRows).toHaveBeenCalledWith(tx, [42]);
    expect(mocks.lockUserRows.mock.invocationCallOrder[0]).toBeLessThan(
      select.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ ok: false, code: "USER_DELETION_PENDING" });
    expect(insert).not.toHaveBeenCalled();
  });
});
