import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { PublicBundle } from "@/app/lib/merch/bundle-definitions";

const cart = vi.hoisted(() => ({
  isAuthenticated: false,
  setItemCount: vi.fn(),
  addGuestBundle: vi.fn(),
  openCart: vi.fn(),
  addBundleToCart: vi.fn(),
}));
vi.mock("@/app/components/providers/cart-provider", () => ({
  useCartContext: () => cart,
}));
vi.mock("@/app/lib/cart/actions", () => ({
  addBundleToCart: cart.addBundleToCart,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { toast } from "sonner";
import BundleDetail from "./bundle-detail";

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  cart.isAuthenticated = false;
});

const option = (
  variantId: number | null,
  label: string | null,
  stock: number,
  unitPriceCents: number,
) => ({ variantId, label, stock, unitPriceCents, imageUrl: null });

const bundle: PublicBundle = {
  id: 4,
  name: "Kit Clásicos",
  slug: "kit-clasicos",
  description: "Todo lo que necesitás.",
  imageUrl: null,
  version: 3,
  sortOrder: 1,
  collectionIds: [],
  priceCents: 15000,
  separateMinCents: 18000,
  separateMaxCents: 18000,
  inStock: true,
  components: [
    {
      componentId: 10,
      productId: 1,
      productName: "Polera",
      productSlug: "polera",
      productStatus: "available",
      productAvailableDate: null,
      imageUrl: null,
      quantity: 1,
      choice: "choice",
      options: [
        option(101, "Talla: S", 0, 10000),
        option(102, "Talla: M", 2, 10000),
        option(103, "Talla: L", 5, 10000),
      ],
    },
    {
      componentId: 11,
      productId: 2,
      productName: "Tote",
      productSlug: "tote",
      productStatus: "available",
      productAvailableDate: null,
      imageUrl: null,
      quantity: 1,
      choice: "none",
      options: [option(null, null, 3, 6000)],
    },
    {
      componentId: 12,
      productId: 3,
      productName: "Stickers",
      productSlug: "stickers",
      productStatus: "presale",
      productAvailableDate: null,
      imageUrl: null,
      quantity: 2,
      choice: "none",
      options: [option(null, null, 10, 1000)],
    },
  ],
};

it("shows the fixed price against the real separate total", () => {
  render(<BundleDetail bundle={bundle} />);
  expect(screen.getByRole("heading", { name: "Kit Clásicos" })).toBeTruthy();
  expect(screen.getByText("Bs150")).toBeTruthy();
  expect(screen.getByText("Bs180")).toBeTruthy();
  expect(screen.getByText("Ahorrás Bs30")).toBeTruthy();
  expect(screen.getByText(/Pre-venta/)).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Stickers" }).getAttribute("href"),
  ).toBe("/store/products/stickers");
});

it("starts on the first size in stock and disables sold-out sizes", () => {
  render(<BundleDetail bundle={bundle} />);
  expect(screen.getByText("Elegí talla")).toBeTruthy();
  const small = screen.getByLabelText(/^S/) as HTMLInputElement;
  const medium = screen.getByLabelText("M") as HTMLInputElement;
  expect(small.disabled).toBe(true);
  expect(medium.checked).toBe(true);
  expect(screen.getByText("Últimas 2 unidades disponibles.")).toBeTruthy();
});

it("adds the chosen configuration to a guest cart through the server's rules", async () => {
  cart.addGuestBundle.mockResolvedValue({ success: true, added: 1 });
  render(<BundleDetail bundle={bundle} />);
  fireEvent.click(screen.getByLabelText("L"));
  // L has 5, but only 3 totes remain: three bundles at most.
  expect(screen.getByText("Últimas 3 unidades disponibles.")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar combo al carrito" }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  expect(cart.addGuestBundle).toHaveBeenCalledWith({
    bundleId: 4,
    bundleVersion: 3,
    quantity: 1,
    selections: [{ componentId: 10, productVariantId: 103 }],
  });
  expect(toast.info).not.toHaveBeenCalled();
});

it("tells a guest when nothing was added, like a signed-in customer", async () => {
  cart.addGuestBundle.mockResolvedValue({
    success: false,
    added: 0,
    message: "Podés llevar hasta 5 unidades de este combo.",
  });
  render(<BundleDetail bundle={bundle} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar combo al carrito" }),
  );
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Podés llevar hasta 5 unidades de este combo.",
    ),
  );
  expect(toast.success).not.toHaveBeenCalled();
});

it("tells a guest how many units stock allowed", async () => {
  cart.addGuestBundle.mockResolvedValue({
    success: true,
    added: 1,
    message: "Agregamos 1 por el stock disponible.",
  });
  render(<BundleDetail bundle={bundle} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar combo al carrito" }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  expect(toast.info).toHaveBeenCalledWith(
    "Agregamos 1 por el stock disponible.",
  );
});

it("sends only the bundle identity and choices for signed-in customers", async () => {
  cart.isAuthenticated = true;
  cart.addBundleToCart.mockResolvedValue({ success: true, newCount: 4 });
  render(<BundleDetail bundle={bundle} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar combo al carrito" }),
  );
  await waitFor(() => expect(cart.setItemCount).toHaveBeenCalledWith(4));
  expect(cart.addBundleToCart).toHaveBeenCalledWith({
    bundleId: 4,
    bundleVersion: 3,
    quantity: 1,
    selections: [{ componentId: 10, productVariantId: 102 }],
  });
});

it("reports a sold-out bundle", () => {
  render(
    <BundleDetail
      bundle={{
        ...bundle,
        inStock: false,
        components: bundle.components.map((component) =>
          component.componentId === 11
            ? { ...component, options: [option(null, null, 0, 6000)] }
            : component,
        ),
      }}
    />,
  );
  expect(screen.getByText("Este combo está agotado.")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Agotado" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("starts on a combination the shared stock can serve", () => {
  // A fixed S and a choice of S or M on one shirt with a single S left: the
  // first size in stock for both would need two S.
  const shirt = bundle.components[0];
  render(
    <BundleDetail
      bundle={{
        ...bundle,
        components: [
          {
            ...shirt,
            componentId: 20,
            choice: "fixed",
            options: [option(101, "Talla: S", 1, 10000)],
          },
          {
            ...shirt,
            componentId: 21,
            options: [
              option(101, "Talla: S", 1, 10000),
              option(102, "Talla: M", 1, 10000),
            ],
          },
          bundle.components[1],
        ],
      }}
    />,
  );
  expect((screen.getByLabelText("M") as HTMLInputElement).checked).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Agregar combo al carrito",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
