import { describe, expect, it, vi } from "vitest";

import {
  lockInfractionsForMutation,
  lockSanctionForMutation,
  type SanctionTransaction,
} from "@/app/lib/sanctions/locking";

describe("sanction mutation locking", () => {
  it("locks the sanction row before edit or revocation", async () => {
    const forUpdate = vi.fn().mockResolvedValue([{ id: 12 }]);
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const tx = {
      select: vi.fn().mockReturnValue({ from }),
    } as unknown as SanctionTransaction;

    await expect(lockSanctionForMutation(tx, 12)).resolves.toMatchObject({
      id: 12,
    });
    expect(forUpdate).toHaveBeenCalledWith("update");
  });

  it("locks selected infractions in deterministic order before linking", async () => {
    const rows = [
      { id: 2, userId: 5, status: "pending" },
      { id: 9, userId: 5, status: "resolved" },
    ];
    const forUpdate = vi.fn().mockResolvedValue(rows);
    const orderBy = vi.fn().mockReturnValue({ for: forUpdate });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const tx = {
      select: vi.fn().mockReturnValue({ from }),
    } as unknown as SanctionTransaction;

    await expect(lockInfractionsForMutation(tx, [9, 2])).resolves.toEqual(rows);
    expect(orderBy).toHaveBeenCalledOnce();
    expect(forUpdate).toHaveBeenCalledWith("update");
  });
});
