import Link from "next/link";
import { merchCollectionPath } from "@/app/lib/merch/paths";
import { Button } from "@/app/components/ui/button";
import { fetchCollectionManagement } from "@/app/lib/merch/collections";

export default async function CollectionsPage() {
  const { collections } = await fetchCollectionManagement();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Colecciones</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Organiza clásicos, colaboraciones, temporadas y festivales.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/store/collections/add">Crear colección</Link>
        </Button>
      </div>
      {collections.length === 0 ? (
        <p className="rounded-xl border p-8 text-center text-muted-foreground">
          Crea tu primera colección y selecciona los productos que la componen.
        </p>
      ) : (
        <div className="divide-y rounded-xl border">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <h3 className="break-words font-medium">{collection.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {collection.isVisible ? "Publicada" : "Borrador"} ·{" "}
                  {collection.productIds.length} productos · Orden{" "}
                  {collection.sortOrder}
                  {collection.showInHero && " · Banner principal"}
                </p>
              </div>
              <div className="flex gap-3">
                {collection.isVisible && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={merchCollectionPath(collection.slug)}>
                      Ver en tienda
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/dashboard/store/collections/${collection.id}/edit`}
                    aria-label={`Editar ${collection.name}`}
                  >
                    Editar
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
