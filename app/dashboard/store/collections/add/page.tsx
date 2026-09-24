import CollectionForm from "@/app/components/organisms/store/collection-form";
import { fetchCollectionManagement } from "@/app/lib/merch/collections";

export default async function AddCollectionPage() {
  const { festivalOptions, productOptions } = await fetchCollectionManagement();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Crear colección</h2>
      <CollectionForm
        festivalOptions={festivalOptions}
        productOptions={productOptions}
      />
    </div>
  );
}
