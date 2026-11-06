import { Metadata } from "next";

import FestivalListsTable from "@/app/components/communications/admin/festival-lists-table";
import NewListButton from "@/app/components/communications/admin/new-list-button";
import SavedListsTable from "@/app/components/communications/admin/saved-lists-table";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";
import { CONFIRMADOS_LIST_EXPLANATION } from "@/app/lib/distribution_lists/definitions";
import {
  fetchFestivalLists,
  fetchSavedLists,
} from "@/app/lib/distribution_lists/queries";

export const metadata: Metadata = {
  title: "Listas · Comunicaciones",
};

export default async function DistributionListsPage() {
  await requireCommunicationsAdmin();
  const [festivals, lists] = await Promise.all([
    fetchFestivalLists(),
    fetchSavedLists(),
  ]);

  return (
    <div className="space-y-6 overflow-y-auto pb-6">
      <p className="text-sm text-muted-foreground">
        Grupos de participantes para comunicados y regalos de créditos.
      </p>

      <section className="space-y-3" aria-labelledby="festival-lists-heading">
        <div>
          <h2 id="festival-lists-heading" className="text-lg font-semibold">
            Por festival
          </h2>
          <p className="text-sm text-muted-foreground">
            {CONFIRMADOS_LIST_EXPLANATION}
          </p>
        </div>
        <FestivalListsTable festivals={festivals} />
      </section>

      <section className="space-y-3" aria-labelledby="saved-lists-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="saved-lists-heading" className="text-lg font-semibold">
            Guardadas
          </h2>
          <NewListButton />
        </div>
        <SavedListsTable lists={lists} />
      </section>
    </div>
  );
}
