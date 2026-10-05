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
vi.mock("@/app/lib/orders/create-order", () => ({
  createGuestOrderInTx: vi.fn(),
  createOrderInTx: vi.fn(),
}));
vi.mock("@/app/lib/orders/order-emails", () => ({
  sendGuestOrderEmails: vi.fn(),
  sendOrderEmails: vi.fn(),
}));
vi.mock("@/app/lib/products/queries", () => ({ fetchProduct: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentBaseProfile: vi.fn(),
}));

import {
  addToCart,
  checkoutCart,
  checkoutGuestCart,
  validateGuestCartStock,
} from "@/app/lib/cart/actions";
import { fetchProduct } from "@/app/lib/products/queries";
import { SUPPLIES_VERIFIED_MESSAGE } from "@/app/lib/store/category";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";

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

const hiddenTote = {
  id: 1,
  name: "Tote",
  stock: 5,
  storeCategory: "merch",
  isVisible: false,
  isPurchasable: true,
  isRentable: false,
  variants: [],
};

const unavailableError = () =>
  new Error("Tote ya no está disponible.", { cause: "product_unavailable" });

describe("hidden products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findClosedSection.mockResolvedValue(null);
    vi.mocked(getCurrentBaseProfile).mockResolvedValue({
      id: 5,
      email: "compradora@example.test",
      displayName: "Compradora",
      status: "verified",
    } as Awaited<ReturnType<typeof getCurrentBaseProfile>>);
    vi.mocked(fetchProduct).mockResolvedValue(
      hiddenTote as unknown as Awaited<ReturnType<typeof fetchProduct>>,
    );
  });

  it("flags a guest line whose product was hidden", async () => {
    const [check] = await validateGuestCartStock(guestItems);

    expect(check).toMatchObject({
      lineKey: "1:base",
      stock: 0,
      isUnavailable: true,
      isOutOfStock: false,
      quantityExceedsStock: false,
    });
  });

  it("refuses to add a hidden product to a signed-in cart", async () => {
    const result = await addToCart({
      productId: 1,
      productVariantId: null,
      quantity: 1,
    });

    expect(result).toMatchObject({
      success: false,
      message: "Este producto ya no está disponible.",
    });
  });

  it("tells a signed-in buyer which product to drop", async () => {
    transaction.mockRejectedValue(unavailableError());

    const result = await checkoutCart();

    expect(result).toMatchObject({
      success: false,
      message:
        "Tote ya no está disponible. Quitalo del carrito para continuar.",
    });
  });

  it("tells a guest which product to drop", async () => {
    selectRows.mockResolvedValue([{ storeCategory: "merch" }]);
    transaction.mockRejectedValue(unavailableError());

    const result = await checkoutGuestCart(guestItems, ...contact);

    expect(result).toEqual({
      success: false,
      message:
        "Tote ya no está disponible. Quitalo del carrito para continuar.",
    });
  });
});
