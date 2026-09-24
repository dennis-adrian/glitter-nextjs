import { notFound } from "next/navigation";
import CollectionForm from "@/app/components/organisms/store/collection-form";
import { fetchCollectionManagement } from "@/app/lib/merch/collections";

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { collections, festivalOptions, productOptions } =
    await fetchCollectionManagement();
  const collection = collections.find((item) => item.id === Number(id));
  if (!collection) notFound();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Editar colección</h2>
      <CollectionForm
        key={collection.id}
        collection={{
          ...collection,
          description: collection.description ?? "",
          imageUrl: collection.imageUrl ?? "",
          campaignImageUrl: collection.campaignImageUrl ?? "",
        }}
        festivalOptions={festivalOptions}
        productOptions={productOptions}
      />
    </div>
  );
}
