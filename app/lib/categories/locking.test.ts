import { describe, expect, it, vi } from "vitest";

import {
  lockCategoryForMutation,
  type CategoryTransaction,
} from "@/app/lib/categories/locking";

describe("category mutation locking", () => {
  it("locks the category row before delete or relationship checks", async () => {
    const forUpdate = vi.fn().mockResolvedValue([{ id: 7, label: "Crochet" }]);
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const tx = {
      select: vi.fn().mockReturnValue({ from }),
    } as unknown as CategoryTransaction;

    await expect(lockCategoryForMutation(tx, 7)).resolves.toMatchObject({
      id: 7,
    });
    expect(forUpdate).toHaveBeenCalledWith("update");
  });
});
