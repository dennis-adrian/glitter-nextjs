import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { BaseProductWithImages } from "@/app/lib/products/definitions";

const state = vi.hoisted(() => ({ params: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.params),
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@/app/components/molecules/store-item-card", () => ({
  default: ({
    product,
    returnTo,
  }: {
    product: { name: string };
    returnTo?: string;
  }) => <p data-return-to={returnTo}>{product.name}</p>,
}));
import MerchStorefront from "./merch-storefront";

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
});

const collection = {
  id: 1,
  slug: "clasicos",
  name: "Clásicos",
  description: "Favoritos de siempre",
  imageUrl: null,
  productIds: [1],
};
const products = [1, 2].map(
  (id) =>
    ({
      id,
      name: `Producto ${id}`,
      isVisible: true,
      storeCategory: "merch",
      stock: 5,
      isPurchasable: true,
      price: 100,
      createdAt: new Date(),
    }) as BaseProductWithImages,
);
afterEach(() => {
  cleanup();
  state.params = "";
  vi.clearAllMocks();
});

it("links featured and remaining collections without repeating the hero card", () => {
  const other = {
    ...collection,
    id: 2,
    slug: "alegrias",
    name: "Pequeñas alegrías",
  };
  render(
    <MerchStorefront products={products} collections={[collection, other]} />,
  );
  expect(
    screen
      .getByRole("link", { name: "Explorar colección" })
      .getAttribute("href"),
  ).toBe("/merch/collections/clasicos");
  expect(
    screen
      .getByRole("link", { name: "Pequeñas alegrías" })
      .getAttribute("href"),
  ).toBe("/merch/collections/alegrias");
  expect(screen.queryByRole("link", { name: "Clásicos" })).toBeNull();
});

it("uses dedicated campaign art and collection copy without changing other card covers", () => {
  const campaign = {
    ...collection,
    campaignImageUrl: "/img/campaign.png",
  };
  const other = {
    ...collection,
    id: 2,
    slug: "alegrias",
    name: "Pequeñas alegrías",
    imageUrl: "/img/cover.png",
  };
  render(
    <MerchStorefront products={products} collections={[campaign, other]} />,
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    collection.name,
  );
  expect(screen.getByText(collection.description)).toBeTruthy();
  expect(
    screen
      .getByRole("img", { name: "Campaña de Clásicos" })
      .getAttribute("src"),
  ).toContain("campaign.png");
  expect(screen.queryByRole("img", { name: "Arte de Clásicos" })).toBeNull();
  expect(
    screen
      .getByRole("link", { name: "Pequeñas alegrías" })
      .querySelector("img")
      ?.getAttribute("src"),
  ).toContain("cover.png");
});

it("keeps the collection campaign visible when sorting by newest", () => {
  state.params = "sort=newest";
  render(<MerchStorefront products={products} collections={[collection]} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Clásicos",
  );
  expect(screen.getByRole("heading", { name: "Toda la merch" })).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Encontrá tu colección" }),
  ).toBeNull();
});

it("uses only selected collections in the rotating main banner", () => {
  const second = {
    ...collection,
    id: 2,
    slug: "alegrias",
    name: "Pequeñas alegrías",
    showInHero: true,
  };
  render(
    <MerchStorefront products={products} collections={[collection, second]} />,
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Pequeñas alegrías",
  );
  expect(
    screen.queryByRole("button", { name: "Ver siguiente colección" }),
  ).toBeNull();
});

it("lets shoppers switch between selected banner collections", () => {
  const second = {
    ...collection,
    id: 2,
    slug: "alegrias",
    name: "Pequeñas alegrías",
    showInHero: true,
  };
  render(
    <MerchStorefront
      products={products}
      collections={[{ ...collection, showInHero: true }, second]}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ver siguiente colección" }),
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Pequeñas alegrías",
  );
});

it("uses the shared checkbox for the availability filter", () => {
  render(<MerchStorefront products={products} collections={[collection]} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Solo disponibles" }));
  expect(state.push).toHaveBeenCalledWith("/merch?available=1#catalogo", {
    scroll: false,
  });
});

it("offers light text for dark campaign artwork", () => {
  render(
    <MerchStorefront
      products={products}
      collections={[
        {
          ...collection,
          campaignImageUrl: "/img/dark-campaign.png",
          campaignTextTone: "light",
        },
      ]}
    />,
  );
  const banner = screen.getByRole("region", { name: "Colección Clásicos" });
  expect(banner.className).toContain("text-white");
  expect(banner.querySelector(".from-black\\/90")).toBeTruthy();
});

it("keeps the collection scope when filtering and clearing filters", () => {
  state.params = "q=Producto&collection=other";
  render(
    <MerchStorefront
      products={products}
      collections={[collection]}
      collection={collection}
    />,
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Clásicos",
  );
  expect(screen.queryByText("Producto 2")).toBeNull();
  expect(screen.getByText("Producto 1")).toBeTruthy();
  expect(screen.getByText("Producto 1").getAttribute("data-return-to")).toBe(
    "/merch/collections/clasicos?q=Producto#catalogo",
  );
  expect(
    screen
      .getByRole("link", { name: "Volver a la tienda" })
      .getAttribute("href"),
  ).toBe("/merch");
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Limpiar filtros" }).getAttribute("href"),
  ).toBe("/merch/collections/clasicos#catalogo");
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Ordenar productos" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(screen.getByRole("option", { name: "Menor precio" }));
  expect(state.push).toHaveBeenCalledWith(
    "/merch/collections/clasicos?q=Producto&sort=price-asc#catalogo",
    { scroll: false },
  );
});

it("keeps store filters as the product return context without showing counts", () => {
  state.params = "q=Producto&sort=newest&available=1";
  render(<MerchStorefront products={products} collections={[collection]} />);
  expect(screen.getByText("Producto 1").getAttribute("data-return-to")).toBe(
    "/merch?q=Producto&sort=newest&available=1#catalogo",
  );
  expect(screen.queryByText("1 colección")).toBeNull();
  expect(screen.queryByText("2 productos")).toBeNull();
});

const bundle = {
  id: 9,
  name: "Kit Clásicos",
  slug: "kit-clasicos",
  description: null,
  imageUrl: "/img/seed-merch/clasicos-cover.png",
  version: 1,
  sortOrder: 1,
  collectionIds: [1],
  priceCents: 15000,
  separateMinCents: 18000,
  separateMaxCents: 18000,
  inStock: true,
  components: [],
};

it("shows a Combos section linking each bundle with its saving", () => {
  render(
    <MerchStorefront
      products={products}
      collections={[collection]}
      bundles={[bundle]}
    />,
  );
  const section = screen.getByRole("region", { name: "Combos" });
  const link = section.querySelector("a")!;
  expect(link.getAttribute("href")).toBe(
    "/merch/combos/kit-clasicos?returnTo=%2Fmerch%23combos",
  );
  expect(link.textContent).toContain("Bs150");
  expect(link.textContent).toContain("Ahorrás Bs30");
});

it("omits the Combos section when no bundle can be sold", () => {
  render(<MerchStorefront products={products} collections={[collection]} />);
  expect(screen.queryByRole("region", { name: "Combos" })).toBeNull();
});

it("shows only bundles on a collection page without products", () => {
  render(
    <MerchStorefront
      products={[]}
      collections={[collection]}
      collection={collection}
      bundles={[bundle]}
    />,
  );
  expect(
    screen.getByRole("region", { name: "Combos de la colección" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Productos de la colección" }),
  ).toBeNull();
});
