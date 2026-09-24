import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import type {
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import type { CartBundleLine } from "@/app/lib/merch/bundle-definitions";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  cart: {} as Record<string, unknown>,
  actions: {
    acceptCartBundleChanges: vi.fn(),
    fetchCartItemCount: vi.fn(),
    fetchCartWithItems: vi.fn(),
    removeCartBundle: vi.fn(),
    resolveGuestCart: vi.fn(),
    updateCartBundleQuantity: vi.fn(),
    validateGuestCartStock: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/app/components/providers/cart-provider", () => ({
  useCartContext: () => mocks.cart,
}));
vi.mock("@/app/lib/cart/actions", () => mocks.actions);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import CartSheet from "./cart-sheet";

const { actions } = mocks;

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
});

const tote = {
  id: 7,
  name: "Tote",
  slug: "tote",
  price: 60,
  stock: 5,
  images: [],
  variants: [],
} as unknown as GuestCartItem["product"];

const guestItem: GuestCartItem = {
  lineKey: "7:base:purchase",
  productId: 7,
  productVariantId: null,
  productVariantLabel: null,
  quantity: 1,
  product: tote,
  variant: null,
};

const guestBundle: GuestCartBundle = {
  lineKey: "bundle:4:-",
  bundleId: 4,
  bundleVersion: 1,
  quantity: 2,
  selections: [],
  name: "Kit Clásicos",
  slug: "kit-clasicos",
  imageUrl: null,
  unitPriceCents: 15000,
  separateUnitPriceCents: 18000,
  components: [],
};

const line = (overrides: Partial<CartBundleLine> = {}): CartBundleLine => ({
  key: "bundle:4:-",
  cartBundleId: null,
  bundleId: 4,
  bundleVersion: 1,
  currentVersion: 1,
  name: "Kit Clásicos",
  slug: "kit-clasicos",
  imageUrl: null,
  quantity: 2,
  selections: [],
  unitPriceCents: 15000,
  separateUnitPriceCents: 18000,
  components: [],
  maxQuantity: 3,
  issue: null,
  message: null,
  ...overrides,
});

function setCart(overrides: Record<string, unknown>) {
  mocks.cart = {
    isOpen: true,
    closeCart: vi.fn(),
    setItemCount: vi.fn(),
    isAuthenticated: false,
    guestItems: [],
    guestBundles: [],
    removeGuestBundle: vi.fn(),
    updateGuestBundleQuantity: vi.fn(),
    replaceGuestBundle: vi.fn(),
    reconcileGuestBundles: vi.fn().mockReturnValue(0),
    removeGuestItem: vi.fn(),
    updateGuestItemQuantity: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  actions.fetchCartItemCount.mockResolvedValue(0);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("checks a guest cart without bundles in a single request", async () => {
  setCart({ guestItems: [guestItem] });
  actions.validateGuestCartStock.mockResolvedValue([
    {
      lineKey: guestItem.lineKey,
      productId: 7,
      productVariantId: null,
      stock: 5,
      isOutOfStock: false,
      quantityExceedsStock: false,
    },
  ]);
  render(<CartSheet />);
  fireEvent.click(screen.getByRole("button", { name: "Proceder al pago" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/checkout"));
  expect(actions.validateGuestCartStock).toHaveBeenCalledTimes(1);
  expect(actions.resolveGuestCart).not.toHaveBeenCalled();
});

it("caps a guest line by what the cart's bundles leave and blocks checkout", async () => {
  setCart({ guestItems: [guestItem], guestBundles: [guestBundle] });
  actions.resolveGuestCart.mockResolvedValue({
    bundles: [line()],
    items: [
      {
        lineKey: guestItem.lineKey,
        productId: 7,
        productVariantId: null,
        // The bundles hold 4 of the 5 totes.
        stock: 0,
        isOutOfStock: true,
        quantityExceedsStock: false,
      },
    ],
    removedBundleKeys: [],
  });
  render(<CartSheet />);
  await screen.findByText("Sin stock");
  expect(
    (
      screen.getByRole("button", {
        name: "Proceder al pago",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(actions.resolveGuestCart).toHaveBeenCalledTimes(1);
  expect(actions.validateGuestCartStock).not.toHaveBeenCalled();
});

it("drops deleted bundles from a guest cart with a notice", async () => {
  const { toast } = await import("sonner");
  const reconcileGuestBundles = vi.fn().mockReturnValue(1);
  setCart({ guestBundles: [guestBundle], reconcileGuestBundles });
  const resolution = {
    bundles: [],
    items: [],
    removedBundleKeys: [guestBundle.lineKey],
  };
  actions.resolveGuestCart.mockResolvedValue(resolution);
  render(<CartSheet />);
  await waitFor(() =>
    expect(reconcileGuestBundles).toHaveBeenCalledWith(resolution),
  );
  expect(toast.info).toHaveBeenCalledWith(
    "Quitamos de tu carrito un combo que ya no existe.",
  );
});

it("confirms only the bundle version the row shows", async () => {
  setCart({ isAuthenticated: true });
  actions.fetchCartWithItems.mockResolvedValue({
    success: true,
    data: {
      id: 1,
      items: [],
      bundles: [
        line({
          key: "cart-bundle:9",
          cartBundleId: 9,
          bundleVersion: 1,
          currentVersion: 3,
          issue: "stale",
          message: "Este combo cambió desde que lo agregaste.",
        }),
      ],
    },
  });
  actions.acceptCartBundleChanges.mockResolvedValue({ success: true });
  render(<CartSheet />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Aceptar precio actual" }),
  );
  await waitFor(() =>
    expect(actions.acceptCartBundleChanges).toHaveBeenCalledWith(9, 3),
  );
});

it("shows an unpublished bundle in a signed-in cart without name or price", async () => {
  setCart({ isAuthenticated: true });
  actions.fetchCartWithItems.mockResolvedValue({
    success: true,
    data: {
      id: 1,
      items: [],
      bundles: [
        line({
          key: "cart-bundle:9",
          cartBundleId: 9,
          name: "Combo no disponible",
          currentVersion: null,
          unitPriceCents: 0,
          issue: "unavailable",
          message: "Este combo ya no está disponible.",
        }),
      ],
    },
  });
  render(<CartSheet />);
  await screen.findByText("Este combo ya no está disponible.");
  expect(screen.getByText("Combo no disponible")).toBeTruthy();
  // The row shows no price (the footer total is a separate span).
  expect(screen.queryAllByText(/Bs/, { selector: "p" })).toEqual([]);
});
