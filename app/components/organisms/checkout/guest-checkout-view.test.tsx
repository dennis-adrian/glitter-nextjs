import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { GuestCartItem } from "@/app/lib/cart/definitions";

const mocks = vi.hoisted(() => ({
  cart: {} as Record<string, unknown>,
  actions: { resolveGuestCart: vi.fn(), validateGuestCartStock: vi.fn() },
}));
vi.mock("@/app/components/providers/cart-provider", () => ({
  useCartContext: () => mocks.cart,
}));
vi.mock("@/app/lib/cart/actions", () => mocks.actions);
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));
vi.mock("@/app/components/organisms/checkout/checkout-page-layout", () => ({
  CheckoutPageLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/app/components/organisms/checkout/guest-checkout-form", () => ({
  GuestCheckoutForm: ({
    blockingMessage,
  }: {
    blockingMessage: string | null;
  }) => <p data-testid="blocking">{blockingMessage ?? ""}</p>,
}));

import GuestCheckoutView from "./guest-checkout-view";

const tote = {
  id: 7,
  name: "Tote",
  slug: "tote",
  price: 60,
  stock: 5,
  status: "available",
  images: [],
  variants: [],
} as unknown as GuestCartItem["product"];

const item: GuestCartItem = {
  lineKey: "7:base:purchase",
  productId: 7,
  productVariantId: null,
  productVariantLabel: null,
  quantity: 4,
  product: tote,
  variant: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("checks individual lines before a guest confirms, even without bundles", async () => {
  mocks.cart = {
    guestItems: [item],
    guestBundles: [],
    guestCartHydrated: true,
    reconcileGuestBundles: vi
      .fn()
      .mockReturnValue({ removed: 0, droppedUnits: 0 }),
  };
  mocks.actions.validateGuestCartStock.mockResolvedValue([
    {
      lineKey: item.lineKey,
      productId: 7,
      productVariantId: null,
      stock: 2,
      isOutOfStock: false,
      quantityExceedsStock: true,
    },
  ]);
  render(<GuestCheckoutView />);
  await waitFor(() =>
    expect(screen.getByTestId("blocking").textContent).toBe(
      "Solo quedan 2 unidades de Tote.",
    ),
  );
  expect(mocks.actions.resolveGuestCart).not.toHaveBeenCalled();
});

it("says a single unit is left in the singular", async () => {
  mocks.cart = {
    guestItems: [item],
    guestBundles: [],
    guestCartHydrated: true,
    reconcileGuestBundles: vi
      .fn()
      .mockReturnValue({ removed: 0, droppedUnits: 0 }),
  };
  mocks.actions.validateGuestCartStock.mockResolvedValue([
    {
      lineKey: item.lineKey,
      productId: 7,
      productVariantId: null,
      stock: 1,
      isOutOfStock: false,
      quantityExceedsStock: true,
    },
  ]);
  render(<GuestCheckoutView />);
  await waitFor(() =>
    expect(screen.getByTestId("blocking").textContent).toBe(
      "Solo queda 1 unidad de Tote.",
    ),
  );
});
