import Link from "next/link";
import { redirect } from "next/navigation";

import StoreSettingsForm from "@/app/components/organisms/store/store-settings-form";
import { Button } from "@/app/components/ui/button";
import { fetchAllStoreSettings } from "@/app/lib/store_settings/data";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function StoreSettingsPage() {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") {
    redirect("/dashboard/store");
  }

  const settings = await fetchAllStoreSettings();

  return (
    <div className="space-y-6">
      <StoreSettingsForm settings={settings} />

      {/* Temporary maintenance section; remove with the correction route. */}
      <section className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Mantenimiento</h3>
          <p className="text-sm text-muted-foreground">
            Herramientas temporales para reconciliar datos históricos.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Categorías históricas</p>
            <p className="text-xs text-muted-foreground">
              Reclasifica líneas de pedidos anteriores al Mercadito de Insumos.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/store/settings/historical-line-categories">
              Abrir herramienta
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
