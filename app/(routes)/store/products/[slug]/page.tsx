import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";

import ProductDetailContent from "@/app/components/organisms/store/product-detail-content";
import { fetchProduct, fetchProductBySlug } from "@/app/lib/products/actions";

const ParamsSchema = z.object({
  slug: z.string().min(1),
});

export default async function ProductDetailPage(props: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);

  if (!validatedParams.success) {
    return notFound();
  }

  const raw = decodeURIComponent(validatedParams.data.slug);

  const product = await fetchProductBySlug(raw, { visibleOnly: true });

  if (!product) {
    if (/^\d+$/.test(raw)) {
      const byId = await fetchProduct(Number(raw));
      if (!byId || !byId.isVisible) {
        return notFound();
      }
      return permanentRedirect(`/store/products/${byId.slug}`);
    }
    return notFound();
  }

  return (
    <div className="container px-3 py-6">
      <Link
        href="/store"
        className="text-sm text-muted-foreground flex items-center gap-1 mb-6 hover:text-foreground transition-colors"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Volver a la tienda
      </Link>

      <ProductDetailContent product={product} />
    </div>
  );
}
