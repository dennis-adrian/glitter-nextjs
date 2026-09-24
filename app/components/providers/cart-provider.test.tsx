import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type {
  GuestCartBundle,
  GuestCartItem,
} from "@/app/lib/cart/definitions";
import { buildBundleLineKey } from "@/app/lib/cart/utils";
import { GUEST_CART_BUNDLES_KEY, GUEST_CART_KEY } from "@/app/lib/constants";

const mocks = vi.hoisted(() => ({ planGuestBundleAdd: vi.fn() }));
vi.mock("@/app/lib/cart/actions", () => mocks);

import { CartProvider, useCartContext } from "./cart-provider";

type CartContext = ReturnType<typeof useCartContext>;
let cart: CartContext;
function Probe({ onContext }: { onContext: (context: CartContext) => void }) {
  const context = useCartContext();
  useEffect(() => onContext(context));
  return null;
}

async function renderGuestCart(
  items: GuestCartItem[],
  bundles: GuestCartBundle[] = [],
) {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  localStorage.setItem(GUEST_CART_BUNDLES_KEY, JSON.stringify(bundles));
  render(
    <CartProvider initialItemCount={0} isAuthenticated={false}>
      <Probe
        onContext={(context) => {
          cart = context;
        }}
      />
    </CartProvider>,
  );
  await waitFor(() => expect(cart.guestCartHydrated).toBe(true));
}

const tote = (stock: number, quantity: number): GuestCartItem => ({
  lineKey: "7:base:purchase",
  productId: 7,
  productVariantId: null,
  productVariantLabel: null,
  quantity,
  product: {
    id: 7,
    name: "Tote",
    price: 60,
    stock,
    images: [],
  } as unknown as GuestCartItem["product"],
  variant: null,
});

const kit = (overrides: Partial<GuestCartBundle> = {}): GuestCartBundle => ({
  lineKey: buildBundleLineKey(4, []),
  bundleId: 4,
  bundleVersion: 1,
  quantity: 2,
  selections: [],
  name: "Kit",
  slug: "kit",
  imageUrl: null,
  unitPriceCents: 15000,
  separateUnitPriceCents: 18000,
  components: [
    {
      productId: 7,
      productVariantId: null,
      productName: "Tote",
      variantLabel: null,
      quantity: 1,
      imageUrl: null,
    },
  ],
  ...overrides,
});

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("says when the per-line cap, not stock, held back a guest product add", async () => {
  await renderGuestCart([tote(20, 5)]);
  const incoming = tote(20, 1);
  let outcome = { added: -1, lineCapped: false };
  act(() => {
    outcome = cart.addGuestItem(incoming);
  });
  expect(outcome).toEqual({ added: 0, lineCapped: true });
  cleanup();

  await renderGuestCart([tote(20, 4)]);
  act(() => {
    outcome = cart.addGuestItem({ ...incoming, quantity: 3 });
  });
  expect(outcome).toEqual({ added: 1, lineCapped: true });
  expect(cart.guestItems[0].quantity).toBe(5);
  cleanup();

  // Stock below the cap is what limits the add.
  await renderGuestCart([tote(3, 3)]);
  act(() => {
    outcome = cart.addGuestItem(tote(3, 1));
  });
  expect(outcome).toEqual({ added: 0, lineCapped: false });
});

it("lets a guest add stock that a stored unbuyable bundle line no longer holds", async () => {
  await renderGuestCart([], [kit({ quantity: 1, blocked: true })]);
  let outcome = { added: -1, lineCapped: false };
  act(() => {
    outcome = cart.addGuestItem(tote(1, 1));
  });
  expect(outcome).toEqual({ added: 1, lineCapped: false });
});

it("lands a guest bundle add on the lines as they are when the plan returns", async () => {
  const stored = kit();
  await renderGuestCart([], [stored]);
  let resolvePlan!: (value: unknown) => void;
  mocks.planGuestBundleAdd.mockReturnValue(
    new Promise((resolve) => {
      resolvePlan = resolve;
    }),
  );
  let adding!: Promise<unknown>;
  act(() => {
    adding = cart.addGuestBundle({
      bundleId: 4,
      bundleVersion: 1,
      quantity: 1,
      selections: [],
    });
  });
  // The guest removes the line while the server plans the merge.
  act(() => cart.removeGuestBundle(stored.lineKey));
  await act(async () => {
    resolvePlan({
      success: true,
      bundle: { ...stored, quantity: 3 },
      replaces: [stored.lineKey],
      added: 1,
    });
    await adding;
  });
  expect(cart.guestBundles).toEqual([{ ...stored, quantity: 1 }]);
  expect(
    JSON.parse(localStorage.getItem(GUEST_CART_BUNDLES_KEY)!),
  ).toMatchObject([{ lineKey: stored.lineKey, quantity: 1 }]);
});

it("merges a guest bundle add into the unchanged line it was planned on", async () => {
  const stored = kit();
  await renderGuestCart([], [stored]);
  mocks.planGuestBundleAdd.mockResolvedValue({
    success: true,
    bundle: { ...stored, quantity: 3 },
    replaces: [stored.lineKey],
    added: 1,
  });
  await act(async () => {
    await cart.addGuestBundle({
      bundleId: 4,
      bundleVersion: 1,
      quantity: 1,
      selections: [],
    });
  });
  expect(cart.guestBundles).toEqual([{ ...stored, quantity: 3 }]);
});

it("reports only the bundle units that land once other changes raised the line", async () => {
  const stored = kit();
  await renderGuestCart([], [stored]);
  const request = {
    bundleId: 4,
    bundleVersion: 1,
    quantity: 2,
    selections: [],
  };
  // Planned on 2 units held: 2 more make 4.
  const planned = {
    success: true,
    bundle: { ...stored, quantity: 4 },
    replaces: [stored.lineKey],
    added: 2,
  };

  // Another change takes the line to the cap while the server plans; both
  // land before the provider re-renders.
  let outcome: unknown;
  mocks.planGuestBundleAdd.mockResolvedValueOnce(planned);
  await act(async () => {
    const adding = cart.addGuestBundle(request);
    cart.updateGuestBundleQuantity(stored.lineKey, 5);
    outcome = await adding;
  });
  expect(outcome).toEqual({
    success: false,
    added: 0,
    message: "Podés llevar hasta 5 unidades de este combo.",
  });
  expect(cart.guestBundles).toEqual([{ ...stored, quantity: 5 }]);
  expect(
    JSON.parse(localStorage.getItem(GUEST_CART_BUNDLES_KEY)!),
  ).toMatchObject([{ lineKey: stored.lineKey, quantity: 5 }]);

  // Raised to 4 instead: one of the two units fits.
  act(() => cart.updateGuestBundleQuantity(stored.lineKey, 2));
  mocks.planGuestBundleAdd.mockResolvedValueOnce(planned);
  await act(async () => {
    const adding = cart.addGuestBundle(request);
    cart.updateGuestBundleQuantity(stored.lineKey, 4);
    outcome = await adding;
  });
  expect(outcome).toEqual({
    success: true,
    added: 1,
    message: "Agregamos 1: podés llevar hasta 5 unidades de este combo.",
  });
  expect(cart.guestBundles).toEqual([{ ...stored, quantity: 5 }]);
});

it("keeps the server's answer when every planned bundle unit lands", async () => {
  const stored = kit();
  await renderGuestCart([], [stored]);
  mocks.planGuestBundleAdd.mockResolvedValue({
    success: true,
    bundle: { ...stored, quantity: 3 },
    replaces: [stored.lineKey],
    added: 1,
    message: "Agregamos 1 por el stock disponible.",
  });
  let outcome: unknown;
  await act(async () => {
    outcome = await cart.addGuestBundle({
      bundleId: 4,
      bundleVersion: 1,
      quantity: 2,
      selections: [],
    });
  });
  expect(outcome).toEqual({
    success: true,
    added: 1,
    message: "Agregamos 1 por el stock disponible.",
  });
});
