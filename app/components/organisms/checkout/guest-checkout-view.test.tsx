import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type {
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import type { CartBundleLine } from "@/app/lib/merch/bundle-definitions";

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
  CheckoutPageLayout: ({
    children,
    bundleItems,
    total,
  }: {
    children: React.ReactNode;
    bundleItems: { key: string; name: string; unitPriceCents: number | null }[];
    total: number;
  }) => (
    <div>
      {bundleItems.map((bundle) => (
        <p key={bundle.key} data-testid="bundle">
          {`${bundle.name}: ${bundle.unitPriceCents ?? "sin precio"}`}
        </p>
      ))}
      <p data-testid="total">{total}</p>
      {children}
    </div>
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

it("shows current names and prices for bundles whose choices no longer resolve", async () => {
  const snapshot = (bundleId: number): GuestCartBundle => ({
    lineKey: `bundle:${bundleId}:-`,
    bundleId,
    bundleVersion: 1,
    quantity: 1,
    selections: [],
    name: `Kit viejo ${bundleId}`,
    slug: "kit",
    imageUrl: null,
    unitPriceCents: 15000,
    separateUnitPriceCents: 18000,
    components: [],
  });
  const resolved = (
    bundle: GuestCartBundle,
    overrides: Partial<CartBundleLine>,
  ): CartBundleLine => ({
    key: bundle.lineKey,
    cartBundleId: null,
    bundleId: bundle.bundleId,
    bundleVersion: 1,
    currentVersion: 2,
    name: "Kit nuevo",
    slug: "kit",
    imageUrl: null,
    quantity: 1,
    selections: [],
    unitPriceCents: 12000,
    separateUnitPriceCents: 16000,
    components: [],
    maxQuantity: 0,
    issue: null,
    message: null,
    ...overrides,
  });
  const invalid = snapshot(4);
  const unavailable = snapshot(5);
  mocks.cart = {
    guestItems: [],
    guestBundles: [invalid, unavailable],
    guestCartHydrated: true,
    reconcileGuestBundles: vi
      .fn()
      .mockReturnValue({ removed: 0, droppedUnits: 0 }),
  };
  mocks.actions.resolveGuestCart.mockResolvedValue({
    bundles: [
      resolved(invalid, {
        issue: "selection_invalid",
        message: "Elegí otra talla.",
      }),
      resolved(unavailable, {
        name: "Combo no disponible",
        unitPriceCents: 0,
        issue: "unavailable",
        message: "Este combo ya no está disponible.",
      }),
    ],
    items: [],
    removedBundleKeys: [],
  });
  render(<GuestCheckoutView />);
  await waitFor(() =>
    expect(screen.getByTestId("blocking").textContent).toBe(
      "Elegí otra talla.",
    ),
  );
  // As in the cart: the live name and price, and none for a bundle that can
  // no longer be bought.
  expect(screen.getAllByTestId("bundle").map((row) => row.textContent)).toEqual(
    ["Kit nuevo: 12000", "Kit viejo 5: sin precio"],
  );
  expect(screen.getByTestId("total").textContent).toBe("120");
});
