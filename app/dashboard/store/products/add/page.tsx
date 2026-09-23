import ProductForm from "@/app/components/organisms/products/product-form";
import { fetchCollectionEditorData } from "@/app/lib/merch/collections";

export default async function AddProductPage() {
  const { options } = await fetchCollectionEditorData();
  return (
    <div className="max-w-5xl">
      <h2 className="text-xl font-semibold mb-6">Agregar producto</h2>
      <ProductForm collectionOptions={options} />
    </div>
  );
}
