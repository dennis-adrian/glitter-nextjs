import FestivalsTable from "@/app/components/organisms/festivals/festivals-table";
import ImportFestivalButton from "@/app/components/festivals/import-festival-button";
import { PlusIcon } from "lucide-react";
import { RedirectButton } from "@/app/components/redirect-button";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchFestivals } from "@/app/lib/festivals/actions";

export default async function Page() {
  const [festivals, fastPassEnabled] = await Promise.all([
    fetchFestivals(),
    isFeatureEnabled("fast_pass"),
  ]);

  return (
    <div className="container p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold md:text-3xl">Festivales</h1>
        <div className="flex items-center gap-2">
          <ImportFestivalButton />
          <RedirectButton href="/dashboard/festivals/add">
            <PlusIcon className="mr-2 h-4 w-4" />
            Agregar Festival
          </RedirectButton>
        </div>
      </div>
      <FestivalsTable festivals={festivals} fastPassEnabled={fastPassEnabled} />
    </div>
  );
}
