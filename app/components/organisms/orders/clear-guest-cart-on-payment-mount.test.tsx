import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/app/lib/cart/actions", () => ({ planGuestBundleAdd: vi.fn() }));

import {
  CartProvider,
  useCartContext,
} from "@/app/components/providers/cart-provider";
import { GUEST_CART_BUNDLES_KEY, GUEST_CART_KEY } from "@/app/lib/constants";
import { ClearGuestCartOnPaymentMount } from "./clear-guest-cart-on-payment-mount";

const storedBundle = {
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

function CartCount() {
  const { itemCount } = useCartContext();
  return <span data-testid="count">{itemCount}</span>;
}

beforeEach(() => {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify([]));
  localStorage.setItem(GUEST_CART_BUNDLES_KEY, JSON.stringify([storedBundle]));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("clears the ordered bundles too, so a reload cannot order them again", () => {
  render(<ClearGuestCartOnPaymentMount />);
  expect(localStorage.getItem(GUEST_CART_KEY)).toBe("[]");
  expect(localStorage.getItem(GUEST_CART_BUNDLES_KEY)).toBe("[]");

  // A store page opened afterwards starts empty.
  render(
    <CartProvider initialItemCount={0} isAuthenticated={false}>
      <CartCount />
    </CartProvider>,
  );
  expect(screen.getByTestId("count").textContent).toBe("0");
});

it("empties a cart provider that is still mounted", () => {
  render(
    <CartProvider initialItemCount={0} isAuthenticated={false}>
      <CartCount />
    </CartProvider>,
  );
  expect(screen.getByTestId("count").textContent).toBe("2");
  render(<ClearGuestCartOnPaymentMount />);
  expect(screen.getByTestId("count").textContent).toBe("0");
});
