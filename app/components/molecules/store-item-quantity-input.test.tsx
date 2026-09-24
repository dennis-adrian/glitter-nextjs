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
vi.mock("@/app/lib/cart/actions", () => ({
  addToCart: vi.fn(),
  fetchCartWithItems: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/app/components/molecules/submit-product-order-button", () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Agregar
    </button>
  ),
}));

import StoreItemQuantityInput from "./store-item-quantity-input";

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
  options: [],
  contentSections: [],
} as unknown as BaseProductWithImages;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Asks for three units, as a guest. */
async function addThree() {
  render(<StoreItemQuantityInput product={tote} />);
  const increase = screen.getByRole("button", { name: "Aumentar cantidad" });
  fireEvent.click(increase);
  fireEvent.click(increase);
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  await waitFor(() =>
    expect(mocks.addGuestItem).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 3 }),
    ),
  );
}

it("names the per-line cap when it, not stock, trims a guest add", async () => {
  mocks.addGuestItem.mockReturnValue({ added: 1, lineCapped: true });
  await addThree();
  expect(mocks.toast.success).toHaveBeenCalledWith(
    "Agregamos 1: podés llevar hasta 5 unidades de este producto.",
  );
});

it("names the per-line cap when it leaves no room at all", async () => {
  mocks.addGuestItem.mockReturnValue({ added: 0, lineCapped: true });
  await addThree();
  expect(mocks.toast.error).toHaveBeenCalledWith(
    "Podés llevar hasta 5 unidades de este producto.",
  );
});

it("blames stock only when stock trims a guest add", async () => {
  mocks.addGuestItem.mockReturnValue({ added: 1, lineCapped: false });
  await addThree();
  expect(mocks.toast.success).toHaveBeenCalledWith(
    "Agregamos 1 por el stock disponible.",
  );
});
