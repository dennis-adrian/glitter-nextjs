import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { CartBundleLine } from "@/app/lib/merch/bundle-definitions";

import { toCheckoutBundleItem } from "./checkout-line-item";
import { CheckoutOrderSummary } from "./checkout-order-summary";

afterEach(cleanup);

const line = (overrides: Partial<CartBundleLine> = {}): CartBundleLine => ({
  key: "7",
  cartBundleId: 7,
  bundleId: 3,
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
  maxQuantity: 5,
  issue: null,
  message: null,
  ...overrides,
});

it("charges a buyable bundle at its fixed price", () => {
  render(
    <CheckoutOrderSummary
      items={[]}
      bundles={[toCheckoutBundleItem(line())]}
      total={300}
    />,
  );
  expect(screen.getByText("2 × Bs 150.00")).toBeTruthy();
  expect(screen.getByText("Bs 300.00", { selector: "p" })).toBeTruthy();
});

it("shows no price for a bundle that can no longer be bought", () => {
  const item = toCheckoutBundleItem(
    line({
      name: "Combo no disponible",
      unitPriceCents: 0,
      issue: "unavailable",
      message: "Este combo ya no está disponible.",
    }),
  );
  expect(item.unitPriceCents).toBeNull();

  render(<CheckoutOrderSummary items={[]} bundles={[item]} total={0} />);
  expect(screen.getByText("Este combo ya no está disponible.")).toBeTruthy();
  expect(screen.queryByText(/× Bs/)).toBeNull();
  expect(screen.queryByText("Bs 0.00", { selector: "p" })).toBeNull();
});
