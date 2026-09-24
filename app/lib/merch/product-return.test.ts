import { expect, it, vi } from "vitest";

vi.mock("./collections", () => ({
  fetchPublicMerchCollection: async (slug: string) =>
    slug === "clasicos" ? { slug, name: "Clásicos", productIds: [1] } : null,
}));

import { resolveMerchProductReturn } from "./product-return";

it("returns to the collection and preserves allowed shopping filters", async () => {
  await expect(
    resolveMerchProductReturn(
      1,
      "/merch/collections/clasicos?sort=newest&q=tote&available=1#catalogo",
    ),
  ).resolves.toEqual({
    href: "/merch/collections/clasicos?q=tote&sort=newest&available=1#catalogo",
    label: "Volver a Clásicos",
  });
});

it("returns to the filtered full store", async () => {
  await expect(
    resolveMerchProductReturn(1, "/merch?q=tote&sort=price-asc#catalogo"),
  ).resolves.toEqual({
    href: "/merch?q=tote&sort=price-asc#catalogo",
    label: "Volver a la tienda",
  });
});

it("defaults direct product visits to the merch store", async () => {
  await expect(resolveMerchProductReturn(1, undefined)).resolves.toEqual({
    href: "/merch",
    label: "Volver a la tienda",
  });
});

it.each([
  "/merch/collections/clasicos",
  "/merch/collections/hidden",
  "//other.example/merch",
  "/dashboard/store/collections",
  "https://other.example/merch",
])("rejects unavailable or unsafe return links: %s", async (returnTo) => {
  const productId = returnTo === "/merch/collections/clasicos" ? 2 : 1;
  await expect(resolveMerchProductReturn(productId, returnTo)).resolves.toEqual(
    {
      href: "/merch",
      label: "Volver a la tienda",
    },
  );
});
