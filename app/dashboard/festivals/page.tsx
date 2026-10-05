import FestivalsTable from "@/app/components/organisms/festivals/festivals-table";
import ImportFestivalButton from "@/app/components/festivals/import-festival-button";
import { PlusIcon } from "lucide-react";
import { RedirectButton } from "@/app/components/redirect-button";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { sortFestivalsForAdmin } from "@/app/lib/festivals/utils";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Festivales",
};

export default async function Page() {
  // The dashboard layout checks this too, but a layout is not a boundary: a
  // page must not render its data for a request the layout never saw.
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const festivals = sortFestivalsForAdmin(await fetchFestivals());

  return (
    // Fills the dashboard's viewport-tall column so the table scrolls inside
    // itself and its toolbar and pagination stay on screen.
    <div className="container flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Festivales</h1>
          <p className="text-sm text-muted-foreground">
            Abre un festival para gestionar su estado, acreditación, espacios y
            participantes.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <ImportFestivalButton />
          <RedirectButton
            href="/dashboard/festivals/add"
            className="flex-1 sm:flex-none"
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Nuevo festival
          </RedirectButton>
        </div>
      </div>
      <FestivalsTable festivals={festivals} />
    </div>
  );
}
