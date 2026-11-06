import type { Metadata } from "next";

import StoreProducts from "@/app/components/organisms/store-products";
import StoreSectionGate from "@/app/components/organisms/store/store-section-gate";
import SuppliesAccessNotice from "@/app/components/organisms/store/supplies-access-notice";
import { isSignedIn } from "@/app/lib/impersonation/viewer";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Mercadito de Insumos",
};

export default async function SuppliesPage() {
  // getCurrentUserProfile() returns null both when signed out and when the
  // profile lookup fails, so authentication state comes from Clerk directly.
  const signedIn = await isSignedIn();
  const profile = await getCurrentUserProfile();

  if (profile?.status !== "verified") {
    return (
      <SuppliesAccessNotice
        variant={signedIn ? "unverified" : "signed_out"}
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
