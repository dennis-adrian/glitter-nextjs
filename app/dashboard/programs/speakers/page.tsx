import { redirect } from "next/navigation";

import SpeakersManager from "@/app/components/dashboard/programs/speakers-manager";
import { fetchSpeakers } from "@/app/lib/programs/data";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export default async function SpeakersPage() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const speakers = await fetchSpeakers();

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Expositores</h1>
        <p className="text-sm text-muted-foreground">
          Perfiles públicos de quienes dan las charlas y talleres. No necesitan
          cuenta en Glitter.
        </p>
      </div>
      <SpeakersManager speakers={speakers} />
    </div>
  );
}
