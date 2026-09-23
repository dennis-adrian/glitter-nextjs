import { notFound } from "next/navigation";
import BundleForm from "@/app/components/organisms/store/bundle-form";
import { fetchBundleEditorData } from "@/app/lib/merch/bundles";

export default async function EditBundlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundleId = Number(id);
  if (!Number.isSafeInteger(bundleId) || bundleId <= 0) notFound();
  const { bundle, products, collectionOptions } =
    await fetchBundleEditorData(bundleId);
  if (!bundle) notFound();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Editar combo</h2>
      <BundleForm
        key={`${bundle.id}-${bundle.version}`}
        bundle={bundle}
        products={products}
        collectionOptions={collectionOptions}
      />
    </div>
  );
}
