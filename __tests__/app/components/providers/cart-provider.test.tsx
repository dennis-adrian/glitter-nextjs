import { render, screen, act, cleanup } from "@testing-library/react";
import { useEffect } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const actions = vi.hoisted(() => ({ planGuestBundleAdd: vi.fn() }));
vi.mock("@/app/lib/cart/actions", () => actions);

import {
  CartProvider,
  useCartContext,
  type GuestBundleAddOutcome,
} from "@/app/components/providers/cart-provider";
import type { GuestCartResolution } from "@/app/lib/cart/actions";
import { GuestCartBundle, GuestCartItem } from "@/app/lib/cart/definitions";
import { buildBundleLineKey, buildCartLineKey } from "@/app/lib/cart/utils";
import {
  GUEST_CART_BUNDLES_KEY,
  GUEST_CART_KEY,
  MAX_CART_LINE_QUANTITY,
} from "@/app/lib/constants";
import type {
  BundleSelectionInput,
  CartBundleLine,
} from "@/app/lib/merch/bundle-definitions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProduct(
  id: number,
  stock: number | null = 10,
): GuestCartItem["product"] {
  return {
    id,
    slug: `product-${id}`,
    name: `Product ${id}`,
    stock,
    images: [],
    description: null,
    price: 100,
    status: "active",
    categoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as GuestCartItem["product"];
}

function buildGuestCartItem(
  productId: number,
  quantity: number,
  stock: number | null = 10,
): GuestCartItem {
  return {
    lineKey: buildCartLineKey(productId, null),
    productId,
    productVariantId: null,
    productVariantLabel: null,
    quantity,
    product: buildProduct(productId, stock),
    variant: null,
  };
}

/** Renders a child component that exposes cart context values via data-testid attributes. */
function TestConsumer() {
  const ctx = useCartContext();
  return (
    <div>
      <span data-testid="item-count">{ctx.itemCount}</span>
      <span data-testid="is-open">{String(ctx.isOpen)}</span>
      <span data-testid="hydrated">{String(ctx.guestCartHydrated)}</span>
      <span data-testid="guest-items">{JSON.stringify(ctx.guestItems)}</span>
      <button onClick={ctx.openCart}>open</button>
      <button onClick={ctx.closeCart}>close</button>
      <button
        onClick={() => ctx.addGuestItem(buildGuestCartItem(1, 1))}
        data-testid="add-item-1"
      >
        add 1
      </button>
      <button
        onClick={() => ctx.removeGuestItem(buildCartLineKey(1, null))}
        data-testid="remove-item-1"
      >
        remove 1
      </button>
      <button
        onClick={() =>
          ctx.updateGuestItemQuantity(buildCartLineKey(1, null), 3)
        }
        data-testid="update-qty-3"
      >
        update qty 3
      </button>
      <button
        onClick={() =>
          ctx.updateGuestItemQuantity(buildCartLineKey(1, null), 0)
        }
        data-testid="update-qty-0"
      >
        update qty 0
      </button>
      <button onClick={ctx.clearGuestCart} data-testid="clear">
        clear
      </button>
    </div>
  );
}

function renderProvider(initialItemCount = 0, isAuthenticated = false) {
  return render(
    <CartProvider
      initialItemCount={initialItemCount}
      isAuthenticated={isAuthenticated}
    >
      <TestConsumer />
    </CartProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCartContext", () => {
  it("throws when used outside CartProvider", () => {
    // ARRANGE: suppress React's console.error for expected throws
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // ACT & ASSERT
    expect(() => render(<TestConsumer />)).toThrow(
      "useCartContext must be used within CartProvider",
    );

    spy.mockRestore();
  });
});

describe("CartProvider — initial state", () => {
  it("exposes initialItemCount for authenticated users", () => {
    // ARRANGE
    const initialItemCount = 3;

    // ACT
    renderProvider(initialItemCount, true);

    // ASSERT
    expect(screen.getByTestId("item-count").textContent).toBe("3");
  });

  it("marks guestCartHydrated true for authenticated users without touching localStorage", () => {
    // ARRANGE: nothing in localStorage, user is authenticated

    // ACT
    renderProvider(0, true);

    // ASSERT
    expect(screen.getByTestId("hydrated").textContent).toBe("true");
    expect(screen.getByTestId("guest-items").textContent).toBe("[]");
    expect(localStorage.getItem(GUEST_CART_KEY)).toBeNull();
  });

  it("hydrates guest cart from localStorage for unauthenticated users", () => {
    // ARRANGE: pre-populate localStorage with a cart
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 2)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));

    // ACT
    renderProvider(0, false);

    // ASSERT: item count reflects stored quantity and hydrated flag is set
    expect(screen.getByTestId("item-count").textContent).toBe("2");
    expect(screen.getByTestId("hydrated").textContent).toBe("true");
    const parsed = JSON.parse(screen.getByTestId("guest-items").textContent!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].productId).toBe(1);
  });

  it("starts with an empty guest cart when localStorage has no entry", () => {
    // ARRANGE: localStorage is empty (cleared in beforeEach)

    // ACT
    renderProvider(0, false);

    // ASSERT
    expect(screen.getByTestId("item-count").textContent).toBe("0");
    expect(screen.getByTestId("guest-items").textContent).toBe("[]");
  });

  it("recovers gracefully when localStorage contains invalid JSON", () => {
    // ARRANGE: corrupt entry in localStorage
    localStorage.setItem(GUEST_CART_KEY, "not-json");

    // ACT
    renderProvider(0, false);

    // ASSERT: falls back to an empty cart without throwing
    expect(screen.getByTestId("guest-items").textContent).toBe("[]");
    expect(screen.getByTestId("item-count").textContent).toBe("0");
  });

  it("drops cart lines with missing or malformed product data", () => {
    // ARRANGE: valid line plus entries missing product or with wrong shape
    localStorage.setItem(
      GUEST_CART_KEY,
      JSON.stringify([
        buildGuestCartItem(1, 2),
        { productId: 2, quantity: 1 },
        { productId: 3, quantity: 1, product: { id: 3, name: "No price" } },
        {
          productId: 4,
          quantity: 1,
          product: { id: 99, name: "Mismatched id", price: 100, images: [] },
        },
        { ...buildGuestCartItem(5, 1), quantity: NaN },
        { ...buildGuestCartItem(6, 1), quantity: Infinity },
        { ...buildGuestCartItem(7, 1), quantity: -1 },
        { ...buildGuestCartItem(8, 1), quantity: 0 },
      ]),
    );

    // ACT
    renderProvider(0, false);

    // ASSERT: only the valid line is kept
    const items = JSON.parse(screen.getByTestId("guest-items").textContent!);
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(1);
    expect(items[0].quantity).toBe(2);
    expect(screen.getByTestId("item-count").textContent).toBe("2");
  });

  it("starts with isOpen false", () => {
    // ARRANGE & ACT
    renderProvider();

    // ASSERT
    expect(screen.getByTestId("is-open").textContent).toBe("false");
  });
});

describe("CartProvider — openCart / closeCart", () => {
  it("opens and closes the cart", () => {
    // ARRANGE
    renderProvider();

    // ACT
    act(() => screen.getByText("open").click());

    // ASSERT
    expect(screen.getByTestId("is-open").textContent).toBe("true");

    // ACT
    act(() => screen.getByText("close").click());

    // ASSERT
    expect(screen.getByTestId("is-open").textContent).toBe("false");
  });
});

describe("CartProvider — addGuestItem", () => {
  it("adds a new item and updates itemCount", () => {
    // ARRANGE
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("add-item-1").click());

    // ASSERT
    expect(screen.getByTestId("item-count").textContent).toBe("1");
    const items = JSON.parse(screen.getByTestId("guest-items").textContent!);
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(1);
    expect(items[0].quantity).toBe(1);
  });

  it("accumulates quantity when adding an existing item", () => {
    // ARRANGE
    renderProvider(0, false);
    act(() => screen.getByTestId("add-item-1").click()); // qty 1

    // ACT
    act(() => screen.getByTestId("add-item-1").click()); // qty 2

    // ASSERT
    expect(screen.getByTestId("item-count").textContent).toBe("2");
    const items = JSON.parse(screen.getByTestId("guest-items").textContent!);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it(`caps accumulated quantity at MAX_CART_LINE_QUANTITY (${MAX_CART_LINE_QUANTITY})`, () => {
    // ARRANGE: pre-populate localStorage so the item already has MAX qty
    const storedItems: GuestCartItem[] = [
      buildGuestCartItem(1, MAX_CART_LINE_QUANTITY),
    ];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT: try to add one more
    act(() => screen.getByTestId("add-item-1").click());

    // ASSERT: quantity does not exceed MAX_CART_LINE_QUANTITY
    const items = JSON.parse(screen.getByTestId("guest-items").textContent!);
    expect(items[0].quantity).toBe(MAX_CART_LINE_QUANTITY);
  });

  it("caps quantity at product stock when stock is lower than MAX_CART_LINE_QUANTITY", () => {
    // ARRANGE: render with a custom add button that uses stock = 2
    const lowStockItem = buildGuestCartItem(99, 1, 2);

    function LowStockConsumer() {
      const ctx = useCartContext();
      return (
        <div>
          <span data-testid="lsc-count">{ctx.itemCount}</span>
          <span data-testid="lsc-items">{JSON.stringify(ctx.guestItems)}</span>
          <button
            onClick={() => ctx.addGuestItem({ ...lowStockItem, quantity: 5 })}
            data-testid="lsc-add"
          >
            add
          </button>
        </div>
      );
    }

    render(
      <CartProvider initialItemCount={0} isAuthenticated={false}>
        <LowStockConsumer />
      </CartProvider>,
    );

    // ACT
    act(() => screen.getByTestId("lsc-add").click());

    // ASSERT: quantity is capped at stock (2)
    const items = JSON.parse(screen.getByTestId("lsc-items").textContent!);
    expect(items[0].quantity).toBe(2);
    expect(screen.getByTestId("lsc-count").textContent).toBe("2");
  });

  it("persists the updated cart to localStorage", () => {
    // ARRANGE
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("add-item-1").click());

    // ASSERT
    const stored = JSON.parse(localStorage.getItem(GUEST_CART_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].productId).toBe(1);
  });
});

describe("CartProvider — removeGuestItem", () => {
  it("removes an item and updates itemCount", () => {
    // ARRANGE: start with one item already in the cart
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 2)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("remove-item-1").click());

    // ASSERT
    expect(screen.getByTestId("item-count").textContent).toBe("0");
    expect(screen.getByTestId("guest-items").textContent).toBe("[]");
  });

  it("is a no-op when the item does not exist", () => {
    // ARRANGE: cart is empty
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("remove-item-1").click());

    // ASSERT: no crash and count remains 0
    expect(screen.getByTestId("item-count").textContent).toBe("0");
  });

  it("persists the updated cart to localStorage after removal", () => {
    // ARRANGE
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 1)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("remove-item-1").click());

    // ASSERT
    const stored = JSON.parse(localStorage.getItem(GUEST_CART_KEY)!);
    expect(stored).toHaveLength(0);
  });
});

describe("CartProvider — updateGuestItemQuantity", () => {
  it("updates quantity of an existing item", () => {
    // ARRANGE: start with item qty 1
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 1)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT: update to qty 3
    act(() => screen.getByTestId("update-qty-3").click());

    // ASSERT
    const items = JSON.parse(screen.getByTestId("guest-items").textContent!);
    expect(items[0].quantity).toBe(3);
    expect(screen.getByTestId("item-count").textContent).toBe("3");
  });

  it("removes the item when quantity is set to 0", () => {
    // ARRANGE
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 2)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("update-qty-0").click());

    // ASSERT
    expect(screen.getByTestId("guest-items").textContent).toBe("[]");
    expect(screen.getByTestId("item-count").textContent).toBe("0");
  });

  it("is a no-op when the item does not exist in the cart", () => {
    // ARRANGE: cart is empty
    renderProvider(0, false);

    // ACT: update an item that does not exist
    act(() => screen.getByTestId("update-qty-3").click());

    // ASSERT: cart stays empty and no crash
    expect(screen.getByTestId("guest-items").textContent).toBe("[]");
    expect(screen.getByTestId("item-count").textContent).toBe("0");
  });

  it(`clamps quantity to MAX_CART_LINE_QUANTITY (${MAX_CART_LINE_QUANTITY})`, () => {
    // ARRANGE: item with enough stock
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 1, 20)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));

    function HighQtyConsumer() {
      const ctx = useCartContext();
      return (
        <div>
          <span data-testid="hqc-items">{JSON.stringify(ctx.guestItems)}</span>
          <button
            onClick={() =>
              ctx.updateGuestItemQuantity(
                buildCartLineKey(1, null),
                MAX_CART_LINE_QUANTITY + 10,
              )
            }
            data-testid="hqc-update"
          >
            update
          </button>
        </div>
      );
    }

    render(
      <CartProvider initialItemCount={0} isAuthenticated={false}>
        <HighQtyConsumer />
      </CartProvider>,
    );

    // ACT
    act(() => screen.getByTestId("hqc-update").click());

    // ASSERT
    const items = JSON.parse(screen.getByTestId("hqc-items").textContent!);
    expect(items[0].quantity).toBe(MAX_CART_LINE_QUANTITY);
  });

  it("clamps quantity to stock when stock is lower than MAX_CART_LINE_QUANTITY", () => {
    // ARRANGE: item with stock = 2
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 1, 2)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));

    function StockCapConsumer() {
      const ctx = useCartContext();
      return (
        <div>
          <span data-testid="scc-items">{JSON.stringify(ctx.guestItems)}</span>
          <button
            onClick={() =>
              ctx.updateGuestItemQuantity(buildCartLineKey(1, null), 4)
            }
            data-testid="scc-update"
          >
            update
          </button>
        </div>
      );
    }

    render(
      <CartProvider initialItemCount={0} isAuthenticated={false}>
        <StockCapConsumer />
      </CartProvider>,
    );

    // ACT
    act(() => screen.getByTestId("scc-update").click());

    // ASSERT
    const items = JSON.parse(screen.getByTestId("scc-items").textContent!);
    expect(items[0].quantity).toBe(2);
  });

  it("persists updated quantity to localStorage", () => {
    // ARRANGE
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 1)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("update-qty-3").click());

    // ASSERT
    const stored = JSON.parse(localStorage.getItem(GUEST_CART_KEY)!);
    expect(stored[0].quantity).toBe(3);
  });
});

describe("CartProvider — clearGuestCart", () => {
  it("empties the cart and resets itemCount to 0", () => {
    // ARRANGE: start with two items
    const storedItems: GuestCartItem[] = [
      buildGuestCartItem(1, 2),
      buildGuestCartItem(2, 3),
    ];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("clear").click());

    // ASSERT
    expect(screen.getByTestId("guest-items").textContent).toBe("[]");
    expect(screen.getByTestId("item-count").textContent).toBe("0");
  });

  it("clears the guest cart from localStorage", () => {
    // ARRANGE
    const storedItems: GuestCartItem[] = [buildGuestCartItem(1, 1)];
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedItems));
    renderProvider(0, false);

    // ACT
    act(() => screen.getByTestId("clear").click());

    // ASSERT
    const stored = JSON.parse(localStorage.getItem(GUEST_CART_KEY)!);
    expect(stored).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Guest bundles
// ---------------------------------------------------------------------------

function buildGuestBundle(
  selections: BundleSelectionInput[],
  overrides: Partial<GuestCartBundle> = {},
): GuestCartBundle {
  const bundleId = overrides.bundleId ?? 4;
  return {
    lineKey: buildBundleLineKey(bundleId, selections),
    bundleId,
    bundleVersion: 2,
    quantity: 1,
    selections,
    name: "Kit Clásicos",
    slug: "kit-clasicos",
    imageUrl: null,
    unitPriceCents: 15000,
    separateUnitPriceCents: 18000,
    components: [],
    ...overrides,
  };
}

function resolvedLine(
  bundle: GuestCartBundle,
  overrides: Partial<CartBundleLine> = {},
): CartBundleLine {
  return {
    key: bundle.lineKey,
    cartBundleId: null,
    bundleId: bundle.bundleId,
    bundleVersion: bundle.bundleVersion,
    currentVersion: bundle.bundleVersion,
    name: bundle.name,
    slug: bundle.slug,
    imageUrl: null,
    quantity: bundle.quantity,
    selections: bundle.selections,
    unitPriceCents: bundle.unitPriceCents,
    separateUnitPriceCents: bundle.separateUnitPriceCents,
    components: [],
    maxQuantity: 5,
    issue: null,
    message: null,
    ...overrides,
  };
}

const shirtM = [{ componentId: 10, productVariantId: 102 }];

function storeBundles(bundles: GuestCartBundle[]) {
  localStorage.setItem(GUEST_CART_BUNDLES_KEY, JSON.stringify(bundles));
}

type CartContext = ReturnType<typeof useCartContext>;
let bundleContext: CartContext;

function BundleConsumer({
  onContext,
}: {
  onContext: (context: CartContext) => void;
}) {
  const context = useCartContext();
  useEffect(() => onContext(context));
  return (
    <span data-testid="guest-bundles">
      {JSON.stringify(
        context.guestBundles.map((bundle) => [bundle.lineKey, bundle.quantity]),
      )}
    </span>
  );
}

function renderBundles() {
  render(
    <CartProvider initialItemCount={0} isAuthenticated={false}>
      <BundleConsumer
        onContext={(context) => {
          bundleContext = context;
        }}
      />
    </CartProvider>,
  );
}

const shownBundles = () =>
  JSON.parse(screen.getByTestId("guest-bundles").textContent!);

describe("CartProvider — addGuestBundle", () => {
  afterEach(() => actions.planGuestBundleAdd.mockReset());

  it("stores the server's merged line in place of the lines it replaces", async () => {
    const legacy = buildGuestBundle(shirtM, { quantity: 1 });
    storeBundles([legacy]);
    renderBundles();
    const merged = buildGuestBundle([], { quantity: 3 });
    actions.planGuestBundleAdd.mockResolvedValue({
      success: true,
      bundle: merged,
      replaces: [legacy.lineKey],
      added: 2,
      message: "Agregamos 2 por el stock disponible.",
    });

    let outcome: GuestBundleAddOutcome | undefined;
    await act(async () => {
      outcome = await bundleContext.addGuestBundle({
        bundleId: 4,
        bundleVersion: 2,
        quantity: 4,
        selections: [],
      });
    });

    expect(actions.planGuestBundleAdd).toHaveBeenCalledWith(
      { bundleId: 4, bundleVersion: 2, quantity: 4, selections: [] },
      [expect.objectContaining({ lineKey: legacy.lineKey, quantity: 1 })],
      [],
    );
    expect(outcome).toEqual({
      success: true,
      added: 2,
      message: "Agregamos 2 por el stock disponible.",
    });
    expect(shownBundles()).toEqual([["bundle:4:-", 3]]);
    expect(
      JSON.parse(localStorage.getItem(GUEST_CART_BUNDLES_KEY)!),
    ).toHaveLength(1);
  });

  it("reports why nothing was added and leaves the cart alone", async () => {
    const line = buildGuestBundle(shirtM, { quantity: 5 });
    storeBundles([line]);
    renderBundles();
    actions.planGuestBundleAdd.mockResolvedValue({
      success: false,
      message: "Podés llevar hasta 5 unidades de este combo.",
    });

    let outcome: GuestBundleAddOutcome | undefined;
    await act(async () => {
      outcome = await bundleContext.addGuestBundle({
        bundleId: 4,
        bundleVersion: 2,
        quantity: 1,
        selections: shirtM,
      });
    });

    expect(outcome).toEqual({
      success: false,
      added: 0,
      message: "Podés llevar hasta 5 unidades de este combo.",
    });
    expect(shownBundles()).toEqual([[line.lineKey, 5]]);
  });
});

describe("CartProvider — reconcileGuestBundles", () => {
  const resolution = (
    bundles: CartBundleLine[],
    removedBundleKeys: string[] = [],
  ): GuestCartResolution => ({ bundles, items: [], removedBundleKeys });

  it("drops lines whose bundle was deleted and merges canonical duplicates", () => {
    const deleted = buildGuestBundle([], { bundleId: 7 });
    const legacy = buildGuestBundle(shirtM, { quantity: 3 });
    const current = buildGuestBundle([], { quantity: 4 });
    storeBundles([deleted, legacy, current]);
    renderBundles();

    let outcome: ReturnType<CartContext["reconcileGuestBundles"]> | undefined;
    act(() => {
      outcome = bundleContext.reconcileGuestBundles(
        resolution(
          [
            // The shirt choice became fixed: the line resolves without it.
            resolvedLine(legacy, { selections: [] }),
            resolvedLine(current),
          ],
          [deleted.lineKey],
        ),
      );
    });

    // 3 + 4 merge up to the per-line limit, which leaves 2 units out.
    expect(outcome).toEqual({ removed: 1, droppedUnits: 2 });
    expect(shownBundles()).toEqual([["bundle:4:-", 5]]);
    expect(JSON.parse(localStorage.getItem(GUEST_CART_BUNDLES_KEY)!)).toEqual([
      expect.objectContaining({ lineKey: "bundle:4:-", selections: [] }),
    ]);
  });

  it("keeps a line that awaits a price confirmation under its own key", () => {
    const stale = buildGuestBundle(shirtM, { bundleVersion: 1 });
    storeBundles([stale]);
    renderBundles();

    act(() => {
      bundleContext.reconcileGuestBundles(
        resolution([
          resolvedLine(stale, {
            selections: [],
            currentVersion: 2,
            issue: "stale",
          }),
        ]),
      );
    });

    expect(shownBundles()).toEqual([[stale.lineKey, 1]]);
  });

  it("leaves the cart untouched while the canonical key awaits a confirmation", () => {
    const legacy = buildGuestBundle(shirtM, { bundleVersion: 2 });
    const stale = buildGuestBundle([], { bundleVersion: 1 });
    storeBundles([legacy, stale]);
    renderBundles();
    const before = bundleContext.guestBundles;

    act(() => {
      bundleContext.reconcileGuestBundles(
        resolution([
          resolvedLine(legacy, { selections: [] }),
          resolvedLine(stale, { currentVersion: 2, issue: "stale" }),
        ]),
      );
    });

    // Same state object: no new resolution is triggered.
    expect(bundleContext.guestBundles).toBe(before);
  });
});

describe("CartProvider — shared guest cart", () => {
  it("re-reads the cart when another tab changes it", () => {
    storeBundles([buildGuestBundle(shirtM)]);
    renderBundles();
    expect(shownBundles()).toHaveLength(1);

    act(() => {
      localStorage.setItem(GUEST_CART_BUNDLES_KEY, "[]");
      window.dispatchEvent(
        new StorageEvent("storage", { key: GUEST_CART_BUNDLES_KEY }),
      );
    });

    expect(shownBundles()).toEqual([]);
  });
});

describe("CartProvider — guest lines share stock with bundles", () => {
  const toteInBundle = (quantity: number) =>
    buildGuestBundle([], {
      quantity,
      components: [
        {
          productId: 99,
          productVariantId: null,
          productName: "Product 99",
          variantLabel: null,
          quantity: 1,
          imageUrl: null,
        },
      ],
    });

  function renderWithBundles(bundles: GuestCartBundle[], items = "[]") {
    storeBundles(bundles);
    localStorage.setItem(GUEST_CART_KEY, items);
    renderBundles();
  }

  const storedItems = () =>
    JSON.parse(localStorage.getItem(GUEST_CART_KEY) ?? "[]") as GuestCartItem[];

  it("caps an individual add by what the cart's bundles leave", () => {
    // Stock 3, and the bundle line holds 2 of them.
    renderWithBundles([toteInBundle(2)]);

    act(() => bundleContext.addGuestItem({ ...buildGuestCartItem(99, 3, 3) }));

    expect(storedItems()).toEqual([
      expect.objectContaining({ productId: 99, quantity: 1 }),
    ]);
  });

  it("stores nothing when the bundles take the whole stock", () => {
    renderWithBundles([toteInBundle(3)]);

    act(() => bundleContext.addGuestItem(buildGuestCartItem(99, 1, 3)));

    expect(bundleContext.guestItems).toEqual([]);
  });

  it("never lowers a line on add, even when stock no longer covers it", () => {
    renderWithBundles(
      [toteInBundle(2)],
      JSON.stringify([buildGuestCartItem(99, 2, 3)]),
    );

    act(() => bundleContext.addGuestItem(buildGuestCartItem(99, 1, 3)));

    expect(bundleContext.guestItems[0].quantity).toBe(2);
  });

  it("caps a quantity increase by what the bundles leave", () => {
    renderWithBundles(
      [toteInBundle(2)],
      JSON.stringify([buildGuestCartItem(99, 1, 5)]),
    );

    act(() =>
      bundleContext.updateGuestItemQuantity(buildCartLineKey(99, null), 5),
    );

    expect(bundleContext.guestItems[0].quantity).toBe(3);
  });

  it("prefers the server's limit and always allows lowering", () => {
    renderWithBundles([], JSON.stringify([buildGuestCartItem(99, 4, 10)]));

    act(() =>
      bundleContext.updateGuestItemQuantity(buildCartLineKey(99, null), 5, 1),
    );
    expect(bundleContext.guestItems[0].quantity).toBe(4);

    act(() =>
      bundleContext.updateGuestItemQuantity(buildCartLineKey(99, null), 2, 1),
    );
    expect(bundleContext.guestItems[0].quantity).toBe(2);
  });
});

describe("CartProvider — replaceGuestBundle", () => {
  it("reports the units a merge leaves out past the per-line limit", () => {
    const stale = buildGuestBundle(shirtM, { bundleVersion: 1, quantity: 3 });
    const current = buildGuestBundle([], { quantity: 4 });
    storeBundles([stale, current]);
    renderBundles();

    let dropped = 0;
    act(() => {
      dropped = bundleContext.replaceGuestBundle(
        stale.lineKey,
        buildGuestBundle([], { quantity: 3 }),
      );
    });

    expect(dropped).toBe(2);
    expect(shownBundles()).toEqual([["bundle:4:-", 5]]);
  });
});
