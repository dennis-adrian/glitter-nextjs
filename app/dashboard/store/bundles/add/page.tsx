import BundleForm from "@/app/components/organisms/store/bundle-form";
import { fetchBundleEditorData } from "@/app/lib/merch/bundles";

export default async function AddBundlePage() {
  const { products, collectionOptions } = await fetchBundleEditorData();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Crear combo</h2>
      <BundleForm products={products} collectionOptions={collectionOptions} />
    </div>
  );
}
