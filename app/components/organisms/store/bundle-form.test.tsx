import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { BundleCatalogProduct } from "@/app/lib/merch/bundle-definitions";

const { save, remove, push } = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue({ success: true }),
  remove: vi.fn().mockResolvedValue({ success: true }),
  push: vi.fn(),
}));
vi.mock("@/app/lib/merch/bundle-actions", () => ({
  saveMerchBundle: save,
  deleteMerchBundle: remove,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/app/components/uploads/uploadthing-image-button", () => ({
  UploadThingImageButton: () => null,
}));
import BundleForm from "./bundle-form";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const product = (
  id: number,
  name: string,
  extra: Partial<BundleCatalogProduct> = {},
) =>
  ({
    id,
    name,
    slug: name.toLowerCase(),
    price: 100,
    discount: 0,
    discountUnit: "percentage",
    stock: 5,
    storeCategory: "merch",
    isVisible: true,
    isPurchasable: true,
    status: "available",
    availableDate: null,
    images: [],
    variants: [],
    ...extra,
  }) as unknown as BundleCatalogProduct;

const variant = (id: number, label: string, price: number | null = null) => ({
  id,
  productId: 1,
  price,
  stock: 4,
  isVisible: true,
  sortOrder: id,
  imageUrl: null,
  selections: [
    {
      option: { id: 1, name: "Talla", sortOrder: 0 },
      optionValue: { id, value: label, sortOrder: id },
    },
  ],
});

const products = [
  product(1, "Polera", {
    variants: [variant(11, "S"), variant(12, "M")],
  } as unknown as Partial<BundleCatalogProduct>),
  product(2, "Tote", { price: 60 }),
  product(3, "Stickers", { price: 25, discount: 20 }),
];

function addProduct(name: string) {
  fireEvent.change(screen.getByLabelText("Agregar producto"), {
    target: { value: name.slice(0, 3) },
  });
  fireEvent.click(screen.getByRole("button", { name: `Agregar ${name}` }));
}

it("builds a bundle from searched products and previews the saving", async () => {
  render(
    <BundleForm
      products={products}
      collectionOptions={[{ id: 7, name: "Clásicos" }]}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
    target: { value: "Kit Clásicos" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: /Identificador de URL/ }),
    { target: { value: "kit-clasicos" } },
  );
  addProduct("Polera");
  addProduct("Tote");
  addProduct("Stickers");
  const quantities = screen.getAllByRole("spinbutton", { name: "Cantidad" });
  fireEvent.change(quantities[2], { target: { value: "2" } });
  // Both sizes are eligible by default: the customer chooses.
  expect(screen.getByText("· el cliente elige")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Precio del combo (Bs)"), {
    target: { value: "150" },
  });
  // Polera 100 + tote 60 + 2 × stickers 20 (after discount) = 200.
  expect(screen.getByText("Bs 200.00")).toBeTruthy();
  expect(screen.getByText("Bs 50.00 (25%)")).toBeTruthy();

  fireEvent.click(screen.getByLabelText("Clásicos"));
  fireEvent.click(screen.getByLabelText("Publicar en la tienda"));
  fireEvent.click(screen.getByRole("button", { name: "Guardar combo" }));

  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0]).toMatchObject({
    name: "Kit Clásicos",
    slug: "kit-clasicos",
    price: 150,
    isVisible: true,
    collectionIds: [7],
    components: [
      { productId: 1, quantity: 1, variantIds: [11, 12] },
      { productId: 2, quantity: 1, variantIds: [] },
      { productId: 3, quantity: 2, variantIds: [] },
    ],
  });
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith("/dashboard/store/bundles"),
  );
});

it("explains why a bundle cannot be published", () => {
  render(<BundleForm products={products} collectionOptions={[]} />);
  addProduct("Tote");
  expect(
    screen.getByText("Un combo necesita al menos dos productos distintos."),
  ).toBeTruthy();
  addProduct("Polera");
  fireEvent.change(screen.getByLabelText("Precio del combo (Bs)"), {
    target: { value: "170" },
  });
  expect(
    screen.getByText(
      "El precio del combo debe ser menor que comprar los productos por separado.",
    ),
  ).toBeTruthy();
  // Fixing a single size makes the component fixed rather than a choice.
  fireEvent.click(screen.getByLabelText(/^S ·|Talla: S/));
  expect(screen.getByText("· fija")).toBeTruthy();
});

it("shows the current error from the server and keeps the form", async () => {
  save.mockResolvedValueOnce({
    success: false,
    message: "Ya existe un combo con esa URL. Elegí otra.",
  });
  render(<BundleForm products={products} collectionOptions={[]} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
    target: { value: "Kit" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: /Identificador de URL/ }),
    { target: { value: "kit" } },
  );
  addProduct("Tote");
  addProduct("Stickers");
  fireEvent.change(screen.getByLabelText("Precio del combo (Bs)"), {
    target: { value: "70" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar combo" }));
  expect(
    await screen.findByText("Ya existe un combo con esa URL. Elegí otra."),
  ).toBeTruthy();
  expect(push).not.toHaveBeenCalled();
});
