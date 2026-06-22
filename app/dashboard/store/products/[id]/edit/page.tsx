import ProductForm from "@/app/components/organisms/products/product-form";
import ProductContentSectionsEditor from "@/app/components/organisms/products/product-content-sections-editor";
import { fetchProduct } from "@/app/lib/products/actions";
import { notFound } from "next/navigation";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);

  if (isNaN(productId)) notFound();

  const product = await fetchProduct(productId);

  if (!product) notFound();

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Editar producto</h2>
      <ProductForm product={product} />
      <ProductContentSectionsEditor
        productId={product.id}
        sections={product.contentSections ?? []}
      />
    </div>
  );
}
