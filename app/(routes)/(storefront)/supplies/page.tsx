import StoreProducts from "@/app/components/organisms/store-products";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { redirect } from "next/navigation";

export default async function SuppliesPage() {
  const profile = await getCurrentUserProfile();

  if (profile?.status !== "verified") {
    redirect("/merch");
  }

  return (
    <div className="container px-3 py-6">
      <StoreProducts
        storeCategory="supplies"
        emptyTitle="Todavía no hay insumos disponibles"
        emptyDescription="Estamos preparando productos útiles para mejorar la presentación de tu stand."
      />
    </div>
  );
}
