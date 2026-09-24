import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { BaseProductWithImages } from "@/app/lib/products/definitions";

const mocks = vi.hoisted(() => ({
  addGuestItem: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/app/components/providers/cart-provider", () => ({
  useCartContext: () => ({
    setItemCount: vi.fn(),
    isAuthenticated: false,
    addGuestItem: mocks.addGuestItem,
  }),
}));
vi.mock("@/app/lib/cart/actions", () => ({ addToCart: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/app/components/molecules/store-product-images", () => ({
  default: () => null,
}));
vi.mock("@/components/molecules/ProductStatusBadge", () => ({
  ProductStatusBadge: () => null,
}));
vi.mock("@/app/components/molecules/store-item-quantity-input", () => ({
  default: () => null,
}));

import StoreItemCard from "./store-item-card";

const tote = {
  id: 7,
  name: "Tote",
  slug: "tote",
  price: 60,
  stock: 20,
  status: "available",
  isPurchasable: true,
  isRentable: false,
  images: [],
  variants: [],
} as unknown as BaseProductWithImages;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function quickAdd() {
  render(<StoreItemCard product={tote} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar al carrito Tote" }),
  );
  await waitFor(() => expect(mocks.addGuestItem).toHaveBeenCalled());
}

it("names the per-line cap when it, not stock, stops a guest quick add", async () => {
  mocks.addGuestItem.mockReturnValue({ added: 0, lineCapped: true });
  await quickAdd();
  expect(mocks.toast.error).toHaveBeenCalledWith(
    "Podés llevar hasta 5 unidades de este producto.",
  );
  expect(mocks.toast.success).not.toHaveBeenCalled();
});

it("blames stock only when stock stops a guest quick add", async () => {
  mocks.addGuestItem.mockReturnValue({ added: 0, lineCapped: false });
  await quickAdd();
  expect(mocks.toast.error).toHaveBeenCalledWith("No hay stock disponible.");
});
