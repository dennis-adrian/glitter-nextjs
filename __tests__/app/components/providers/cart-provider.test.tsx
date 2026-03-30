import { render, screen, act, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CartProvider,
  useCartContext,
} from "@/app/components/providers/cart-provider";
import { GuestCartItem } from "@/app/lib/cart/definitions";
import { GUEST_CART_KEY, MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";

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
  return { productId, quantity, product: buildProduct(productId, stock) };
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
        onClick={() => ctx.removeGuestItem(1)}
        data-testid="remove-item-1"
      >
        remove 1
      </button>
      <button
        onClick={() => ctx.updateGuestItemQuantity(1, 3)}
        data-testid="update-qty-3"
      >
        update qty 3
      </button>
      <button
        onClick={() => ctx.updateGuestItemQuantity(1, 0)}
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
              ctx.updateGuestItemQuantity(1, MAX_CART_LINE_QUANTITY + 10)
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
            onClick={() => ctx.updateGuestItemQuantity(1, 4)}
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
