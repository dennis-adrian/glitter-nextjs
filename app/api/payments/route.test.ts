import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/payments/route";

describe("POST /api/payments", () => {
  it("rejects voucher URL submissions", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    });
  });
});
