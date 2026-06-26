import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { z } from "zod";

import ProductDetailContent from "@/app/components/organisms/store/product-detail-content";
import StoreSectionGate from "@/app/components/organisms/store/store-section-gate";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { fetchProduct, fetchProductBySlug } from "@/app/lib/products/actions";
import { getRentalEligibilityForCurrentUser } from "@/app/lib/rentals/eligibility";
import { getProductVariantImageUrl } from "@/app/lib/products/variants";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
  slug: z.string().min(1),
});

type ProductDetailParams = z.infer<typeof ParamsSchema>;

async function resolvePublicProduct(slug: string) {
  const raw = decodeURIComponent(slug);
  const product = await fetchProductBySlug(raw, { visibleOnly: true });

  if (product) {
    return { product, redirectSlug: null };
  }

  if (/^\d+$/.test(raw)) {
    const byId = await fetchProduct(Number(raw));
    if (!byId || !byId.isVisible) {
      return { product: null, redirectSlug: null };
    }

    return { product: byId, redirectSlug: byId.slug };
  }

  return { product: null, redirectSlug: null };
}

export async function generateMetadata(props: {
  params: Promise<ProductDetailParams>;
}): Promise<Metadata> {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);

  if (!validatedParams.success) {
    return {};
  }

  const { product } = await resolvePublicProduct(validatedParams.data.slug);

  if (!product) {
    return {};
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const rawImageUrl =
    getProductVariantImageUrl(product, null) ?? PLACEHOLDER_IMAGE_URLS["1200"];
  const imageUrl =
    rawImageUrl.startsWith("http://") || rawImageUrl.startsWith("https://")
      ? rawImageUrl
      : `${baseUrl}${rawImageUrl}`;
  const description = product.description ?? undefined;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      url: `/store/products/${encodeURIComponent(product.slug)}`,
      images: [
        {
          url: imageUrl,
          alt: product.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ProductDetailPage(props: {
  params: Promise<ProductDetailParams>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);

  if (!validatedParams.success) {
    return notFound();
  }

  const { product, redirectSlug } = await resolvePublicProduct(
    validatedParams.data.slug,
  );

  if (!product) {
    return notFound();
  }

  if (redirectSlug) {
    return permanentRedirect(`/store/products/${redirectSlug}`);
  }

  const profile = await getCurrentUserProfile();
  if (product.storeCategory === "supplies" && profile?.status !== "verified") {
    return redirect("/merch");
  }

  const rentalEligibility = await getRentalEligibilityForCurrentUser();

  return (
    <StoreSectionGate section={product.storeCategory}>
      <div className="container px-3 py-6">
        <Link
          href={product.storeCategory === "supplies" ? "/supplies" : "/merch"}
          className="text-sm text-muted-foreground flex items-center gap-1 mb-6 hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Volver a la tienda
        </Link>

        <ProductDetailContent
          product={product}
          rentalEligible={rentalEligibility.eligible}
          rentalContexts={
            rentalEligibility.eligible ? rentalEligibility.contexts : []
          }
        />
      </div>
    </StoreSectionGate>
  );
}
