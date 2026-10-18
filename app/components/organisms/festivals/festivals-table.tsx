"use client";

import { CalendarDaysIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";

import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import FestivalActionsMenu from "@/app/components/festivals/festival-actions-menu";
import {
  columns,
  columnTitles,
  FESTIVAL_STATUS_OPTIONS,
  FestivalRegistrationStatus,
} from "@/app/components/organisms/festivals/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatFestivalDateRange } from "@/app/lib/festivals/utils";

type FestivalsTableProps = {
  festivals: FestivalWithDates[];
};

function FestivalMobileRow({ festival }: { festival: FestivalWithDates }) {
  const dateRange = formatFestivalDateRange(festival.festivalDates);

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <FestivalStatusBadge status={festival.status} />
          {festival.status === "active" ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Acreditación: <FestivalRegistrationStatus festival={festival} />
            </span>
          ) : null}
        </div>
        <Link
          href={`/dashboard/festivals/${festival.id}`}
          className="block font-medium leading-snug hover:underline"
        >
          {festival.name}
        </Link>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarDaysIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {dateRange ?? "Sin fechas"}
          </p>
          {festival.locationLabel ? (
            <p className="flex items-center gap-1.5">
              <MapPinIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{festival.locationLabel}</span>
            </p>
          ) : null}
        </div>
      </div>
      <FestivalActionsMenu
        festival={festival}
        showSections
        triggerClassName="-mr-1 -mt-1 shrink-0"
      />
    </div>
  );
}

export default function FestivalsTable({ festivals }: FestivalsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={festivals}
      columnTitles={columnTitles}
      searchPlaceholder="Buscar por nombre o lugar"
      filters={[
        {
          columnId: "status",
          label: "Estado",
          options: FESTIVAL_STATUS_OPTIONS,
        },
      ]}
      renderMobileRow={(festival) => <FestivalMobileRow festival={festival} />}
      emptyMessage="No hay festivales que coincidan."
    />
  );
}
