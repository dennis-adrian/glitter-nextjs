import Link from "next/link";
import BundleCover from "./bundle-cover";
import type { PublicBundle } from "@/app/lib/merch/bundle-definitions";
import {
  formatBundleMoneyShort,
  formatBundleProductCount,
} from "@/app/lib/merch/bundle-pricing";
import { merchBundlePath } from "@/app/lib/merch/paths";

export function bundleSavingsLabel(bundle: PublicBundle) {
  const savings = bundle.separateMinCents - bundle.priceCents;
  // The minimum saving is guaranteed for every allowed combination.
  return bundle.separateMinCents === bundle.separateMaxCents
    ? `Ahorrás ${formatBundleMoneyShort(savings)}`
    : `Ahorrás desde ${formatBundleMoneyShort(savings)}`;
}

export default function BundleCard({
  bundle,
  returnTo,
}: {
  bundle: PublicBundle;
  returnTo?: string;
}) {
  const unitCount = bundle.components.reduce(
    (sum, component) => sum + component.quantity,
    0,
  );
  const href = `${merchBundlePath(bundle.slug)}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <div className="relative">
        <BundleCover
          name={bundle.name}
          imageUrl={bundle.imageUrl}
          componentImageUrls={bundle.components.map((c) => c.imageUrl)}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
          className={
            bundle.inStock ? "aspect-square" : "aspect-square opacity-60"
          }
        />
        <span className="absolute left-3 top-3 rounded-full bg-brand-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          Combo
        </span>
        {!bundle.inStock && (
          <span className="absolute right-3 top-3 rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold">
            Agotado
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 py-4">
        <p className="line-clamp-2 text-sm font-medium leading-tight group-hover:underline">
          {bundle.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {unitCount} {unitCount === 1 ? "artículo" : "artículos"} ·{" "}
          {formatBundleProductCount(bundle.components)}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-base font-semibold">
            {formatBundleMoneyShort(bundle.priceCents)}
          </span>
          {/* The cheapest separate purchase, never an inflated list price. */}
          <span className="text-xs text-muted-foreground line-through">
            <span className="sr-only">Por separado </span>
            {formatBundleMoneyShort(bundle.separateMinCents)}
          </span>
        </div>
        <span className="w-fit rounded-full bg-brand-coral-soft px-2 py-0.5 text-xs font-semibold text-brand-ink">
          {bundleSavingsLabel(bundle)}
        </span>
      </div>
    </Link>
  );
}
