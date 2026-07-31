import { redirect } from "next/navigation";

import FeatureFlagsList from "@/app/components/organisms/feature_flags/feature-flags-list";
import { fetchAllFeatureFlags } from "@/app/lib/feature_flags/data";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function FeatureFlagsPage() {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const flags = await fetchAllFeatureFlags();

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Funcionalidades</h1>
        <p className="text-sm text-muted-foreground">
          Controla qué funcionalidades ya construidas son visibles y para quién.
          Los cambios se aplican de inmediato, sin necesidad de un nuevo
          despliegue, y solo afectan al entorno donde estás ahora.
        </p>
      </div>

      <FeatureFlagsList flags={flags} />
    </div>
  );
}
