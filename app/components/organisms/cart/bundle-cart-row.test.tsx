import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BundleCartRow, type BundleCartRowProps } from "./bundle-cart-row";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = (
  overrides: Partial<BundleCartRowProps> = {},
): BundleCartRowProps => ({
  name: "Kit Clásicos",
  imageUrl: null,
  unitPriceCents: 15000,
  separateUnitPriceCents: 18000,
  quantity: 2,
  maxQuantity: 3,
  components: [
    { productName: "Polera", variantLabel: "Talla: M", quantity: 1 },
    { productName: "Stickers", variantLabel: null, quantity: 2 },
  ],
  issue: null,
  message: null,
  onQuantityChange: vi.fn(),
  onRemove: vi.fn(),
  onAcceptChanges: vi.fn(),
  ...overrides,
});

it("groups the bundle with its contents and totals", () => {
  render(<BundleCartRow {...props()} />);
  expect(screen.getByText("Bs 300.00")).toBeTruthy();
  expect(screen.getByText("Incluye 3 artículos")).toBeTruthy();
  expect(screen.getByText("1 × Polera (Talla: M)")).toBeTruthy();
  expect(
    screen.getByRole("combobox", { name: "Cantidad de Kit Clásicos" }),
  ).toBeTruthy();
});

it("removes the whole bundle", () => {
  const onRemove = vi.fn();
  render(<BundleCartRow {...props({ onRemove })} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Eliminar el combo Kit Clásicos del carrito",
    }),
  );
  expect(onRemove).toHaveBeenCalledTimes(1);
});

it("asks the customer to accept a changed bundle before buying it", () => {
  const onAcceptChanges = vi.fn();
  render(
    <BundleCartRow
      {...props({
        issue: "stale",
        message: "Este combo cambió desde que lo agregaste.",
        onAcceptChanges,
      })}
    />,
  );
  expect(
    screen.getByText("Este combo cambió desde que lo agregaste."),
  ).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Aceptar precio actual" }),
  );
  expect(onAcceptChanges).toHaveBeenCalledTimes(1);
});

it("locks quantity for unavailable bundles", () => {
  render(
    <BundleCartRow
      {...props({
        issue: "unavailable",
        message: "Este combo ya no está disponible.",
        components: [],
      })}
    />,
  );
  expect(screen.getByText("Cantidad: 2")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Aceptar precio actual" }),
  ).toBeNull();
});

it("shows no price for a bundle that is no longer published", () => {
  render(
    <BundleCartRow
      {...props({
        name: "Combo no disponible",
        unitPriceCents: null,
        issue: "unavailable",
        message: "Este combo ya no está disponible.",
        components: [],
      })}
    />,
  );
  expect(screen.queryByText(/Bs/)).toBeNull();
  expect(
    screen.getByRole("button", {
      name: "Eliminar el combo Combo no disponible del carrito",
    }),
  ).toBeTruthy();
});
