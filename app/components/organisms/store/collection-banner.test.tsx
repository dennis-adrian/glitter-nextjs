import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { MerchCollection } from "@/app/lib/merch/definitions";

import CollectionBanner from "./collection-banner";

afterEach(cleanup);

const collection: MerchCollection = {
  id: 1,
  slug: "clasicos",
  name: "Clásicos",
  description: "Favoritos de siempre",
  imageUrl: null,
  campaignImageUrl: "/img/seed-merch/clasicos-campaign.png",
  productIds: [1],
  bundleIds: [],
};

/** The layer that makes the whole banner clickable. */
function bannerLayer(container: HTMLElement) {
  return container.querySelector('a[aria-hidden="true"]');
}

it("takes the whole campaign banner to the collection's catalog", () => {
  const { container } = render(<CollectionBanner collection={collection} />);
  const button = screen.getByRole("link", { name: "Explorar colección" });
  expect(button.getAttribute("href")).toBe(
    "/merch/collections/clasicos#catalogo",
  );
  const layer = bannerLayer(container);
  expect(layer?.getAttribute("href")).toBe(
    "/merch/collections/clasicos#catalogo",
  );
  // The button stays the only link keyboard and screen reader users meet.
  expect(layer?.getAttribute("tabindex")).toBe("-1");
  expect(screen.getAllByRole("link")).toHaveLength(1);
});

it("makes the banner without campaign art clickable too", () => {
  const { container } = render(
    <CollectionBanner collection={{ ...collection, campaignImageUrl: null }} />,
  );
  expect(bannerLayer(container)?.getAttribute("href")).toBe(
    "/merch/collections/clasicos#catalogo",
  );
});

it("lands on the combos of a collection that only holds bundles", () => {
  const { container } = render(
    <CollectionBanner
      collection={{ ...collection, productIds: [], bundleIds: [4] }}
    />,
  );
  expect(
    screen
      .getByRole("link", { name: "Explorar colección" })
      .getAttribute("href"),
  ).toBe("/merch/collections/clasicos#combos");
  expect(bannerLayer(container)?.getAttribute("href")).toBe(
    "/merch/collections/clasicos#combos",
  );
});

it("scrolls to the catalog on the collection's own page", () => {
  const { container } = render(
    <CollectionBanner collection={collection} isCollectionPage />,
  );
  expect(
    screen.getByRole("link", { name: "Ver productos" }).getAttribute("href"),
  ).toBe("#catalogo");
  expect(bannerLayer(container)?.getAttribute("href")).toBe("#catalogo");
});

it("links nowhere in the editor preview", () => {
  const { container } = render(
    <CollectionBanner collection={collection} preview />,
  );
  expect(container.querySelector("a")).toBeNull();
});
