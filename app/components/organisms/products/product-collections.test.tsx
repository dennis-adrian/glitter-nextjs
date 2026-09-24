import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { BaseProductWithImages } from "@/app/lib/products/definitions";

const { updateProduct } = vi.hoisted(() => ({
  updateProduct: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/vendors/uploadthing", () => ({
  useUploadThing: () => ({ startUpload: vi.fn(), isUploading: false }),
}));
vi.mock("@/app/lib/products/actions", () => ({
  updateProduct,
  createProduct: vi.fn(),
}));
vi.mock("@/app/lib/products/image-actions", () => ({
  deleteProductImage: vi.fn(),
}));
import ProductForm from "./product-form";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("enables saving collection-only edits and submits the selected festival IDs", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const product: BaseProductWithImages = {
    id: 1,
    name: "Polera",
    slug: "polera",
    description: null,
    price: 100,
    unitCost: null,
    stock: 10,
    lowStockThreshold: 5,
    imageUrl: null,
    isNew: true,
    isFeatured: false,
    isVisible: true,
    storeCategory: "merch",
    availableDate: null,
    discount: 0,
    discountUnit: "percentage",
    status: "available",
    isPurchasable: true,
    isRentable: false,
    rentalPrice: null,
    rentalStockMode: "shared",
    rentalStock: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [],
  };
  render(
    <ProductForm
      product={product}
      collectionOptions={[
        { id: 1, name: "Festival uno" },
        { id: 2, name: "Festival dos" },
      ]}
      initialCollectionIds={[1]}
    />,
  );
  const save = screen.getByRole("button", {
    name: "Guardar cambios",
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect(screen.getByRole("checkbox", { name: "Festival dos" }).tagName).toBe(
    "BUTTON",
  );
  fireEvent.click(screen.getByLabelText("Festival dos"));
  expect(save.disabled).toBe(false);
  fireEvent.click(screen.getByLabelText("Festival dos"));
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Festival uno"));
  fireEvent.click(screen.getByLabelText("Festival dos"));
  fireEvent.click(save);
  await waitFor(() =>
    expect(updateProduct).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ collectionIds: [2] }),
    ),
  );
});
