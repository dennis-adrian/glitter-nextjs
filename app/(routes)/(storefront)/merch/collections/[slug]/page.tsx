import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MerchStorefront from "@/app/components/organisms/store/merch-storefront";
import StoreSectionGate from "@/app/components/organisms/store/store-section-gate";
import { fetchPublicMerchCollection } from "@/app/lib/merch/collections";
import { fetchPublicBundles } from "@/app/lib/merch/bundles";
import { merchCollectionPath } from "@/app/lib/merch/paths";
import { fetchProducts } from "@/app/lib/products/actions";
import { getRentalEligibilityForCurrentUser } from "@/app/lib/rentals/eligibility";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = await fetchPublicMerchCollection(slug);
  if (!collection) notFound();
  const title = `${collection.name} | Merch Glitter`;
  const description =
    collection.description ||
    `Explorá la colección ${collection.name} de Glitter.`;
  const url = merchCollectionPath(collection.slug);
  // The share image comes from ./opengraph-image.tsx. Next serves it under a
  // hashed name because the route sits in route groups, so listing images
  // here would point crawlers at a URL that does not exist.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

async function CollectionCatalog({ slug }: { slug: string }) {
  const collection = await fetchPublicMerchCollection(slug);
  if (!collection) notFound();
  const [products, bundles, eligibility] = await Promise.all([
    fetchProducts("default", { visibleOnly: true, storeCategory: "merch" }),
    fetchPublicBundles(),
    getRentalEligibilityForCurrentUser().catch(() => null),
  ]);
  return (
    <MerchStorefront
      products={products.filter((product) =>
        collection.productIds.includes(product.id),
      )}
      collections={[collection]}
      collection={collection}
      bundles={bundles.filter((bundle) =>
        bundle.collectionIds.includes(collection.id),
      )}
      rentalEligible={eligibility?.eligible ?? false}
      rentalContexts={eligibility?.eligible ? eligibility.contexts : []}
    />
  );
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  return (
    <StoreSectionGate section="merch">
      <CollectionCatalog slug={slug} />
    </StoreSectionGate>
  );
}
