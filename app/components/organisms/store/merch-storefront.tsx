"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Search, ShoppingBag, X } from "lucide-react";
import CollectionBanner from "./collection-banner";
import FeaturedCollectionCarousel from "./featured-collection-carousel";
import StoreItemCard from "@/app/components/molecules/store-item-card";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import type { BaseProductWithImages } from "@/app/lib/products/definitions";
import type { MerchCollection } from "@/app/lib/merch/definitions";
import type { RentalEligibilityContext } from "@/app/lib/rentals/types";
import { filterMerchCatalog } from "@/app/lib/merch/catalog";
import { merchCollectionPath } from "@/app/lib/merch/paths";

export type MerchStorefrontProps = {
  products: BaseProductWithImages[];
  collections: MerchCollection[];
  collection?: MerchCollection;
  rentalEligible?: boolean;
  rentalContexts?: RentalEligibilityContext[];
};

export default function MerchStorefront({
  products,
  collections,
  collection: pageCollection,
  rentalEligible,
  rentalContexts,
}: MerchStorefrontProps) {
  const params = useSearchParams();
  const router = useRouter();
  const collectionId = pageCollection?.slug ?? params.get("collection") ?? "";
  const basePath = pageCollection
    ? merchCollectionPath(pageCollection.slug)
    : "/merch";
  const query = params.get("q") ?? "";
  const sort = params.get("sort") ?? "featured";
  const available = params.get("available") === "1";
  const selectedCollection =
    pageCollection ??
    collections.find(
      (collection) =>
        collection.slug === collectionId ||
        String(collection.id) === collectionId,
    );
  const selectedForHero = collections.filter(
    (collection) => collection.showInHero,
  );
  const featured = selectedForHero.length
    ? selectedForHero
    : collections.slice(0, 1);
  const filtered = filterMerchCatalog(products, collections, {
    collection: collectionId,
    query,
    sort,
    available,
  });
  const showHero = !pageCollection && products.length > 0;
  const featuredIds = new Set(featured.map((collection) => collection.id));
  const listedCollections = showHero
    ? collections.filter((collection) => !featuredIds.has(collection.id))
    : collections;
  const CatalogHeading = showHero || pageCollection ? "h2" : "h1";
  const returnParams = new URLSearchParams();
  for (const key of ["q", "sort", "available"]) {
    const value = params.get(key);
    if (value) returnParams.set(key, value);
  }
  const returnTo = `${basePath}${returnParams.size ? `?${returnParams}` : ""}#catalogo`;

  function catalogUrl(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    next.delete("collection");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `${basePath}${next.size ? `?${next}` : ""}#catalogo`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      {pageCollection && (
        <Link
          href="/merch"
          className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Volver a la tienda
        </Link>
      )}

      {pageCollection && (
        <CollectionBanner collection={pageCollection} isCollectionPage />
      )}
      {showHero && featured.length > 0 && (
        <FeaturedCollectionCarousel collections={featured} />
      )}
      {showHero && featured.length === 0 && (
        <section className="rounded-2xl bg-brand-lavender p-7 text-brand-ink sm:p-10">
          <h1 className="font-display text-4xl sm:text-5xl">
            Merch de Glitter
          </h1>
          <p className="mt-4">
            Descubrí nuestros festivals y ediciones especiales.
          </p>
          <Button asChild size="sm" className="mt-6">
            <Link href="#catalogo">Explorar merch</Link>
          </Button>
        </section>
      )}

      {!pageCollection && listedCollections.length > 0 && (
        <section
          id="colecciones"
          aria-labelledby="collections-title"
          className="scroll-mt-44 py-9 sm:py-12"
        >
          <div className="mb-5">
            <h2
              id="collections-title"
              className="font-display text-2xl sm:text-3xl"
            >
              Encontrá tu colección
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Todos nuestros festivales y ediciones para coleccionar.
            </p>
          </div>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
            {listedCollections.map((collection) => (
              <Link
                key={collection.id}
                href={merchCollectionPath(collection.slug)}
                aria-current={
                  selectedCollection?.id === collection.id ? "true" : undefined
                }
                className="group w-60 shrink-0 snap-start rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:w-72"
              >
                <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-muted">
                  <Image
                    src={
                      collection.imageUrl ||
                      "/img/landing-festivals/glitter-characters.png"
                    }
                    alt=""
                    fill
                    sizes="288px"
                    className="object-contain"
                  />
                  <span className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-background text-foreground">
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="mt-3 font-semibold group-hover:underline group-aria-[current=true]:text-primary">
                  {collection.name}
                </h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section
        id="catalogo"
        aria-labelledby="catalog-title"
        className="scroll-mt-44 pt-8"
      >
        <div className="mb-6">
          <CatalogHeading
            id="catalog-title"
            className="font-display text-3xl sm:text-4xl"
          >
            {pageCollection
              ? "Productos de la colección"
              : (selectedCollection?.name ??
                (collectionId ? "Colección no disponible" : "Toda la merch"))}
          </CatalogHeading>
        </div>
        {!pageCollection && selectedCollection?.description && (
          <p className="mb-6 max-w-2xl whitespace-pre-line text-muted-foreground">
            {selectedCollection.description}
          </p>
        )}
        <div className="flex flex-col gap-4 border-y py-4 lg:flex-row lg:items-center lg:justify-between">
          <form
            className="flex w-full items-center gap-2 rounded-full border bg-background pl-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 lg:max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              router.push(
                catalogUrl({ q: String(data.get("q") ?? "").trim() }),
                { scroll: false },
              );
            }}
            role="search"
          >
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              key={query}
              defaultValue={query}
              name="q"
              type="search"
              aria-label="Buscar merch"
              placeholder="Buscá tu merch favorita"
              className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="min-h-11 rounded-full px-4 text-sm font-medium hover:bg-muted"
            >
              Buscar
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label
              htmlFor="merch-available"
              className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id="merch-available"
                checked={available}
                onCheckedChange={(checked) =>
                  router.push(
                    catalogUrl({ available: checked === true ? "1" : "" }),
                    { scroll: false },
                  )
                }
              />
              Solo disponibles
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Ordenar:</span>
              <Select
                value={sort}
                onValueChange={(value) =>
                  router.push(catalogUrl({ sort: value }), {
                    scroll: false,
                  })
                }
              >
                <SelectTrigger aria-label="Ordenar productos" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Destacados</SelectItem>
                  <SelectItem value="newest">Más recientes</SelectItem>
                  <SelectItem value="price-asc">Menor precio</SelectItem>
                  <SelectItem value="price-desc">Mayor precio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        {((!pageCollection && collectionId) ||
          query ||
          available ||
          sort !== "featured") && (
          <div className="flex flex-wrap items-center gap-3 pt-4 text-sm">
            <span>
              {[
                !pageCollection && selectedCollection?.name,
                query && `“${query}”`,
                available && "Disponibles",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <Link
              href={`${basePath}#catalogo`}
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-muted px-3"
            >
              Limpiar filtros
              <X className="size-3" aria-hidden="true" />
            </Link>
          </div>
        )}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 items-start gap-x-4 gap-y-8 pt-7 md:grid-cols-3 lg:grid-cols-4 sm:gap-x-6">
            {filtered.map((product) => (
              <StoreItemCard
                key={product.id}
                product={product}
                rentalEligible={rentalEligible}
                rentalContexts={rentalContexts}
                presentation="merch"
                returnTo={returnTo}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-16 text-center">
            <ShoppingBag
              className="mb-4 size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="font-display text-2xl">
              {products.length
                ? "No encontramos esa merch"
                : "La próxima colección está en camino"}
            </h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {products.length
                ? "Probá con otro nombre o explorá todos los productos."
                : "Volvé pronto para descubrir nuestras próximas colecciones."}
            </p>
            {products.length > 0 && (
              <Button asChild className="mt-5 rounded-full">
                <Link href="/merch#catalogo">Ver toda la merch</Link>
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
