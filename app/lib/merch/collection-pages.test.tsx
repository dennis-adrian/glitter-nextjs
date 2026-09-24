// @vitest-environment node
import { expect, it, vi } from "vitest";

const collection = vi.hoisted(() => ({
  id: 1,
  slug: "clasicos",
  name: "Clásicos",
  description: "Favoritos de siempre",
  imageUrl: "/img/seed-merch/clasicos-cover.png",
  productIds: [1],
}));
const bannerCollection = vi.hoisted(() => ({
  id: 2,
  slug: "campana",
  name: "Campaña",
  description: "Con banner",
  imageUrl: null,
  campaignImageUrl: "/img/seed-merch/clasicos-campaign.png",
  campaignTextTone: "dark" as const,
  productIds: [1],
}));
vi.mock("@/app/lib/merch/collections", () => ({
  fetchPublicMerchCollection: async (slug: string) =>
    [collection, bannerCollection].find((entry) => entry.slug === slug) ??
    null,
  fetchMerchCollections: async () => [collection, bannerCollection],
}));
vi.mock("@/app/lib/products/actions", () => ({ fetchProducts: vi.fn() }));
vi.mock("@/app/lib/merch/bundles", () => ({
  fetchPublicBundles: async () => [],
}));
vi.mock("@/app/lib/rentals/eligibility", () => ({
  getRentalEligibilityForCurrentUser: vi.fn(),
}));
vi.mock("@/app/components/organisms/store/store-section-gate", () => ({
  default: () => null,
}));
vi.mock("@/app/components/organisms/store/merch-storefront", () => ({
  default: () => null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
import MerchPage from "@/app/(routes)/(storefront)/merch/page";
import { generateMetadata } from "@/app/(routes)/(storefront)/merch/collections/[slug]/page";
import CollectionOpenGraphImage from "@/app/(routes)/(storefront)/merch/collections/[slug]/opengraph-image";

it("provides collection-specific canonical and sharing metadata", async () => {
  const metadata = await generateMetadata({
    params: Promise.resolve({ slug: "clasicos" }),
  });
  expect(metadata).toMatchObject({
    title: "Clásicos | Merch Glitter",
    description: collection.description,
    alternates: { canonical: "/merch/collections/clasicos" },
    openGraph: { url: "/merch/collections/clasicos" },
    twitter: { card: "summary_large_image" },
  });
  // The share image comes from the opengraph-image file route, which Next
  // serves under a hashed name; a hand-written URL would 404 for crawlers.
  expect(metadata.openGraph).not.toHaveProperty("images");
  expect(metadata.twitter).not.toHaveProperty("images");
});

it.each(["clasicos", "campana"])(
  "renders a collection-specific Open Graph PNG (%s)",
  async (slug) => {
    const image = await CollectionOpenGraphImage({
      params: Promise.resolve({ slug }),
    });
    expect(image.headers.get("content-type")).toContain("image/png");
    const png = Buffer.from(await image.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  },
  30_000,
);

it("does not expose an unavailable collection in metadata", async () => {
  await expect(
    generateMetadata({ params: Promise.resolve({ slug: "hidden" }) }),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    CollectionOpenGraphImage({ params: Promise.resolve({ slug: "hidden" }) }),
  ).rejects.toThrow("NOT_FOUND");
});

it.each(["clasicos", "1"])(
  "redirects legacy collection %s and retains shopping filters",
  async (key) => {
    const page = MerchPage({
      searchParams: Promise.resolve({
        collection: key,
        q: "polera",
        available: "1",
        sort: "price-asc",
      }),
    });
    const catalog = page.props.children;
    await expect(catalog.type(catalog.props)).rejects.toThrow(
      "REDIRECT:/merch/collections/clasicos?q=polera&sort=price-asc&available=1",
    );
  },
);
