import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      discountCodes: { findMany: vi.fn(), findFirst: vi.fn() },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createDiscountCode,
  fetchDiscountCodes,
} from "@/app/lib/discount_codes/actions";

describe("discount code admin authorization", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
  });

  it("rejects festival_admin create and list", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(
      createDiscountCode({
        code: "FREE",
        discountUnit: "percentage",
        discountValue: 100,
        expiresAt: new Date("2027-01-01"),
      } as never),
    ).resolves.toMatchObject({ success: false });
    await expect(fetchDiscountCodes()).resolves.toEqual([]);
  });

  it("rejects unauthenticated create", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(
      createDiscountCode({
        code: "FREE",
        discountUnit: "percentage",
        discountValue: 100,
        expiresAt: new Date("2027-01-01"),
      } as never),
    ).resolves.toMatchObject({ success: false });
  });
});
