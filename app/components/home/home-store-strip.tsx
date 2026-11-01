import Image from "next/image";
import Link from "next/link";

import { PackageIcon } from "lucide-react";

import { HubSection } from "@/app/components/participations/hub/hub-section";
import { formatMoney } from "@/app/lib/formatters";
import type { HomeStore } from "@/app/lib/home/load";

const COPY = {
  supplies: {
    title: "Insumos y alquileres para tu stand",
    action: { label: "Mercadito", href: "/supplies" },
  },
  merch: {
    title: "Destacados de la Tiendita",
    action: { label: "Ver tiendita", href: "/merch" },
  },
} as const;

/**
 * A few products in a row that scrolls sideways: supplies and rentals for
 * someone with a stand coming up, the store's featured merch otherwise.
 */
export default function HomeStoreStrip({ store }: { store: HomeStore }) {
  const copy = COPY[store.kind];
  const title =
    store.kind === "merch" && !store.featured ? "De la Tiendita" : copy.title;

  return (
    <HubSection title={title} action={copy.action}>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {store.products.map((product) => (
          <li key={product.id} className="w-36 shrink-0 snap-start">
            <Link
              href={`/store/products/${encodeURIComponent(product.slug)}`}
              className="group flex flex-col gap-1.5"
            >
              <span className="relative block aspect-square overflow-hidden rounded-2xl bg-brand-lavender/40">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt=""
                    fill
                    sizes="144px"
                    className="object-cover transition-transform group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-brand-primary">
                    <PackageIcon className="size-7" aria-hidden="true" />
                  </span>
                )}
                {product.rental ? (
                  <span className="absolute left-2 top-2 rounded-full bg-brand-ink px-2 py-0.5 text-[11px] font-semibold text-white">
                    Alquiler
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-brand-ink group-hover:text-brand-primary">
                {product.name}
              </span>
              <span className="text-sm font-bold text-brand-ink">
                {formatMoney(product.price)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </HubSection>
  );
}
