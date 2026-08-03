import StoreProducts from "@/app/components/organisms/store-products";
import StoreSectionGate from "@/app/components/organisms/store/store-section-gate";
import SuppliesAccessNotice from "@/app/components/organisms/store/supplies-access-notice";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function SuppliesPage() {
  const profile = await getCurrentUserProfile();

  if (profile?.status !== "verified") {
    return (
      <SuppliesAccessNotice
        variant={profile ? "unverified" : "signed_out"}
        returnTo="/supplies"
      />
    );
  }

  return (
    <StoreSectionGate section="supplies">
      <div className="container px-3 py-6">
        <StoreProducts
          storeCategory="supplies"
          emptyTitle="Todavía no hay insumos disponibles"
          emptyDescription="Estamos preparando productos útiles para mejorar la presentación de tu stand."
        />
      </div>
    </StoreSectionGate>
  );
}
