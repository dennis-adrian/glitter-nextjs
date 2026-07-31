import { redirect } from "next/navigation";

import VenuesManager from "@/app/components/dashboard/programs/venues-manager";
import { fetchVenues } from "@/app/lib/programs/data";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export default async function VenuesPage() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const venues = await fetchVenues();

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Lugares</h1>
        <p className="text-sm text-muted-foreground">
          Un programa define su lugar por defecto; cada sesión u horario puede
          usar otro.
        </p>
      </div>
      <VenuesManager venues={venues} />
    </div>
  );
}
