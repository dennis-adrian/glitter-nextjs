// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRows: vi.fn<() => Promise<{ storeCategory: string }[]>>(),
  transaction: vi.fn(),
  findClosedSection: vi.fn(),
}));
const { selectRows, transaction, findClosedSection } = mocks;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => mocks.selectRows() }) }),
    transaction: mocks.transaction,
  },
}));
vi.mock("@/app/lib/store_settings/closure", () => ({
  findClosedSection: mocks.findClosedSection,
  resolveSectionClosure: vi.fn(),
  storeClosureMessage: () => "Tienda cerrada.",
}));
vi.mock("@/app/lib/orders/actions", () => ({
  createGuestOrderInTx: vi.fn(),
  createOrderInTx: vi.fn(),
  sendGuestOrderEmails: vi.fn(),
  sendOrderEmails: vi.fn(),
}));
vi.mock("@/app/lib/products/actions", () => ({ fetchProduct: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentBaseProfile: vi.fn(),
}));

import { checkoutGuestCart } from "@/app/lib/cart/actions";
import { SUPPLIES_VERIFIED_MESSAGE } from "@/app/lib/store/category";

const guestItems = [
  { lineKey: "1:base", productId: 1, productVariantId: null, quantity: 1 },
];

const contact = ["Invitada", "invitada@example.test", "+59171234567"] as const;

describe("checkoutGuestCart supplies gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findClosedSection.mockResolvedValue(null);
  });

  it("rejects supplies before opening the order transaction", async () => {
    selectRows.mockResolvedValue([{ storeCategory: "supplies" }]);

    const result = await checkoutGuestCart(guestItems, ...contact);

    expect(result).toEqual({
      success: false,
      message: SUPPLIES_VERIFIED_MESSAGE,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(findClosedSection).not.toHaveBeenCalled();
  });

  it("continues to the transaction for merchandise-only carts", async () => {
    selectRows.mockResolvedValue([{ storeCategory: "merch" }]);
    transaction.mockResolvedValue({
      orderId: 42,
      guestOrderToken: "token",
      mappedProducts: [],
      totalAmount: 10,
    });

    const result = await checkoutGuestCart(guestItems, ...contact);

    expect(result.success).toBe(true);
    expect(result.orderId).toBe(42);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("surfaces a transactional supplies rejection to the caller", async () => {
    selectRows.mockResolvedValue([{ storeCategory: "merch" }]);
    transaction.mockRejectedValue(
      new Error(SUPPLIES_VERIFIED_MESSAGE, { cause: "supplies_unverified" }),
    );

    const result = await checkoutGuestCart(guestItems, ...contact);

    expect(result).toEqual({
      success: false,
      message: SUPPLIES_VERIFIED_MESSAGE,
    });
  });
});
