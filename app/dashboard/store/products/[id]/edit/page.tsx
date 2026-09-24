import ProductForm from "@/app/components/organisms/products/product-form";
import ProductContentSectionsEditor from "@/app/components/organisms/products/product-content-sections-editor";
import { fetchProduct } from "@/app/lib/products/actions";
import { fetchCollectionEditorData } from "@/app/lib/merch/collections";
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
  const { options, selectedIds } = await fetchCollectionEditorData(productId);

  return (
    <div className="max-w-5xl pb-24 md:pb-0">
      <h2 className="text-xl font-semibold mb-6">Editar producto</h2>
      <ProductForm
        key={product.id}
        product={product}
        collectionOptions={options}
        initialCollectionIds={selectedIds}
      />
      <ProductContentSectionsEditor
        productId={product.id}
        sections={product.contentSections ?? []}
      />
    </div>
  );
}
