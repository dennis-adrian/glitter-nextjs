import { redirect } from "next/navigation";

import ProgramForm from "@/app/components/dashboard/programs/program-form";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { fetchVenues } from "@/app/lib/programs/data";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export default async function NewProgramPage() {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const [venues, festivals] = await Promise.all([
    fetchVenues(),
    fetchFestivals(),
  ]);

  return (
    <div className="container p-3 md:p-6 max-w-2xl flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Nuevo programa</h1>
      <ProgramForm
        venues={venues}
        festivals={festivals.map((festival) => ({
          id: festival.id,
          name: festival.name,
        }))}
      />
    </div>
  );
}
