import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type {
  EvaluatedBundleComponent,
  PublicBundle,
} from "@/app/lib/merch/bundle-definitions";
import BundleCard from "./bundle-card";

afterEach(cleanup);

const component = (
  componentId: number,
  productId: number,
  quantity: number,
): EvaluatedBundleComponent => ({
  componentId,
  productId,
  productName: `Producto ${productId}`,
  productSlug: `producto-${productId}`,
  productStatus: "available",
  productAvailableDate: null,
  imageUrl: null,
  quantity,
  choice: "none",
  options: [
    {
      variantId: null,
      label: null,
      unitPriceCents: 5000,
      stock: 5,
      imageUrl: null,
    },
  ],
});

const bundle: PublicBundle = {
  id: 9,
  name: "Dos poleras y tote",
  slug: "dos-poleras",
  description: null,
  imageUrl: "/img/seed-merch/clasicos-cover.png",
  version: 1,
  sortOrder: 1,
  collectionIds: [],
  priceCents: 12000,
  separateMinCents: 15000,
  separateMaxCents: 15000,
  inStock: true,
  // Two components of the same shirt (separate size choices) and a tote.
  components: [component(1, 1, 1), component(2, 1, 1), component(3, 2, 1)],
};

it("counts items and distinct products", () => {
  render(<BundleCard bundle={bundle} />);
  expect(screen.getByText("3 artículos · 2 productos")).toBeTruthy();
});
