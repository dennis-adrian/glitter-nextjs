import MerchStorefront from "@/app/components/organisms/store/merch-storefront";
import StoreSectionGate from "@/app/components/organisms/store/store-section-gate";
import { fetchProducts } from "@/app/lib/products/actions";
import { fetchMerchCollections } from "@/app/lib/merch/collections";
import { getRentalEligibilityForCurrentUser } from "@/app/lib/rentals/eligibility";
import { notFound, redirect } from "next/navigation";
import { merchCollectionPath } from "@/app/lib/merch/paths";

export const metadata = {
  title: "Merch y colecciones | Glitter",
  description:
    "Explorá la merch oficial de Glitter: todos nuestros festivales y ediciones especiales.",
};

type SearchParams = Record<string, string | string[] | undefined>;

async function MerchCatalog({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  if (params.collection) {
    const key = Array.isArray(params.collection)
      ? params.collection[0]
      : params.collection;
    const collections = await fetchMerchCollections();
    const collection = collections.find(
      (item) => item.slug === key || String(item.id) === key,
    );
    if (!collection) notFound();
    const filters = new URLSearchParams();
    for (const key of ["q", "sort", "available"]) {
      const value = params[key];
      if (typeof value === "string" && value) filters.set(key, value);
    }
    redirect(
      `${merchCollectionPath(collection.slug)}${filters.size ? `?${filters}` : ""}`,
    );
  }
  const [products, collections, eligibility] = await Promise.all([
    fetchProducts("default", { visibleOnly: true, storeCategory: "merch" }),
    fetchMerchCollections(),
    getRentalEligibilityForCurrentUser().catch(() => null),
  ]);
  return (
    <MerchStorefront
      products={products}
      collections={collections}
      rentalEligible={eligibility?.eligible ?? false}
      rentalContexts={eligibility?.eligible ? eligibility.contexts : []}
    />
  );
}

export default function MerchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <StoreSectionGate section="merch">
      <MerchCatalog searchParams={searchParams} />
    </StoreSectionGate>
  );
}
