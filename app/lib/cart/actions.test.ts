// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRows: vi.fn<() => Promise<{ storeCategory: string }[]>>(),
  transaction: vi.fn(),
  findClosedSection: vi.fn(),
  consumeGuestCheckoutRateLimit: vi.fn(),
  getCurrentBaseProfile: vi.fn(),
}));
const {
  selectRows,
  transaction,
  findClosedSection,
  consumeGuestCheckoutRateLimit,
  getCurrentBaseProfile,
} = mocks;

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
  getCurrentBaseProfile: mocks.getCurrentBaseProfile,
}));
vi.mock("@/app/lib/cart/guest-checkout-rate-limit", () => ({
  consumeGuestCheckoutRateLimit: mocks.consumeGuestCheckoutRateLimit,
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
    consumeGuestCheckoutRateLimit.mockResolvedValue(true);
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

describe("checkoutGuestCart rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findClosedSection.mockResolvedValue(null);
    selectRows.mockResolvedValue([{ storeCategory: "merch" }]);
  });

  it("refuses a caller over the limit before reading products or taking stock", async () => {
    consumeGuestCheckoutRateLimit.mockResolvedValue(false);

    const result = await checkoutGuestCart(guestItems, ...contact);

    expect(result).toEqual({
      success: false,
      message: "Demasiados pedidos seguidos. Esperá un rato e intentá de nuevo.",
    });
    expect(selectRows).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("limits an anonymous guest by address and their contact email", async () => {
    consumeGuestCheckoutRateLimit.mockResolvedValue(false);
    getCurrentBaseProfile.mockResolvedValue(null);

    await checkoutGuestCart(guestItems, ...contact);

    expect(consumeGuestCheckoutRateLimit).toHaveBeenCalledWith({
      userId: null,
      email: "invitada@example.test",
    });
  });

  it("limits a signed-in caller by their account", async () => {
    consumeGuestCheckoutRateLimit.mockResolvedValue(false);
    getCurrentBaseProfile.mockResolvedValue({ id: 42 });

    await checkoutGuestCart(guestItems, ...contact);

    expect(consumeGuestCheckoutRateLimit).toHaveBeenCalledWith({
      userId: 42,
      email: "invitada@example.test",
    });
  });

  it("does not spend the allowance on a request it rejects as invalid", async () => {
    await checkoutGuestCart([], ...contact);
    await checkoutGuestCart(guestItems, "Invitada", "no-es-un-correo", "+5917");

    expect(consumeGuestCheckoutRateLimit).not.toHaveBeenCalled();
  });
});
