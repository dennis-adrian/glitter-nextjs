import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import BundleDetail from "@/app/components/organisms/store/bundle-detail";
import StoreSectionGate from "@/app/components/organisms/store/store-section-gate";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { fetchPublicBundle } from "@/app/lib/merch/bundles";
import {
  formatBundleMoneyShort,
  formatBundleProductCount,
} from "@/app/lib/merch/bundle-pricing";
import { merchBundlePath } from "@/app/lib/merch/paths";
import { resolveMerchBundleReturn } from "@/app/lib/merch/product-return";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await fetchPublicBundle(decodeURIComponent(slug));
  if (!bundle) notFound();
  const title = `${bundle.name} | Combos Glitter`;
  const description =
    bundle.description ||
    `Combo de ${formatBundleProductCount(bundle.components)} por ${formatBundleMoneyShort(bundle.priceCents)}.`;
  const url = merchBundlePath(bundle.slug);
  // Relative URLs resolve against the root layout's metadataBase.
  const image =
    bundle.imageUrl ??
    bundle.components[0]?.imageUrl ??
    PLACEHOLDER_IMAGE_URLS["1200"];
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: [{ url: image, alt: `Combo ${bundle.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

async function BundlePageContent({ params, searchParams }: Props) {
  const { slug } = await params;
  const bundle = await fetchPublicBundle(decodeURIComponent(slug));
  if (!bundle) notFound();
  const returnLink = await resolveMerchBundleReturn(
    bundle.id,
    (await searchParams).returnTo,
  );
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <Link
        href={returnLink.href}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {returnLink.label}
      </Link>
      <BundleDetail bundle={bundle} />
    </div>
  );
}

export default function BundlePage(props: Props) {
  return (
    <StoreSectionGate section="merch">
      <BundlePageContent {...props} />
    </StoreSectionGate>
  );
}
