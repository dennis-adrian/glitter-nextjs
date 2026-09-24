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
vi.mock("@/app/lib/merch/collections", () => ({
  fetchPublicMerchCollection: async (slug: string) =>
    slug === collection.slug ? collection : null,
  fetchMerchCollections: async () => [collection],
}));
vi.mock("@/app/lib/products/actions", () => ({ fetchProducts: vi.fn() }));
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
    openGraph: {
      url: "/merch/collections/clasicos",
      images: [
        {
          url: "/merch/collections/clasicos/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Colección Clásicos de Glitter",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/merch/collections/clasicos/opengraph-image"],
    },
  });
});

it("renders a collection-specific Open Graph PNG", async () => {
  const image = await CollectionOpenGraphImage({
    params: Promise.resolve({ slug: "clasicos" }),
  });
  expect(image.headers.get("content-type")).toContain("image/png");
  const png = Buffer.from(await image.arrayBuffer());
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
}, 30_000);

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
