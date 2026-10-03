"use client";

import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import StatusDot from "@/app/components/atoms/status-dot";
import FestivalActionsMenu from "@/app/components/festivals/festival-actions-menu";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import {
  formatFestivalDateRange,
  sortFestivalDates,
} from "@/app/lib/festivals/utils";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

export const columnTitles: Record<string, string> = {
  name: "Festival",
  dates: "Fechas",
  status: "Estado",
  registration: "Acreditación",
  actions: "Acciones",
};

export const FESTIVAL_STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "published", label: "Publicado" },
  { value: "draft", label: "Borrador" },
  { value: "archived", label: "Archivado" },
];

export function firstFestivalDate(festival: FestivalWithDates) {
  return sortFestivalDates(festival.festivalDates)[0]?.startDate ?? null;
}

/**
 * Whether visitors can get a ticket right now: the switch alone is not
 * enough, since the public form also requires an active festival.
 */
export function FestivalRegistrationStatus({
  festival,
}: {
  festival: FestivalWithDates;
}) {
  if (festival.status !== "active") {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return festival.publicRegistration ? (
    <StatusDot tone="success" label="Abierta" />
  ) : (
    <StatusDot tone="neutral" label="Cerrada" />
  );
}

export const columns: ColumnDef<FestivalWithDates>[] = [
  {
    id: "name",
    // The location rides along so the search box finds a festival by venue.
    accessorFn: (festival) =>
      `${festival.name} ${festival.locationLabel ?? ""}`.trim(),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.name!} />
    ),
    cell: ({ row }) => (
      <div className="min-w-48 max-w-80">
        <Link
          href={`/dashboard/festivals/${row.original.id}`}
          className="block truncate font-medium hover:underline"
        >
          {row.original.name}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          {row.original.locationLabel || "Sin ubicación"}
        </span>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "dates",
    accessorFn: (festival) => firstFestivalDate(festival)?.getTime() ?? 0,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.dates!} />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {formatFestivalDateRange(row.original.festivalDates) ?? (
          <span className="text-muted-foreground">Sin fechas</span>
        )}
      </span>
    ),
    sortDescFirst: true,
    enableGlobalFilter: false,
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.status!} />
    ),
    cell: ({ row }) => <FestivalStatusBadge status={row.original.status} />,
    filterFn: (row, _columnId, filterValue: string[]) => {
      if (!filterValue?.length) return true;
      return filterValue.includes(row.original.status);
    },
    enableGlobalFilter: false,
  },
  {
    id: "registration",
    accessorFn: (festival) =>
      festival.status === "active" && festival.publicRegistration ? 1 : 0,
    header: columnTitles.registration,
    cell: ({ row }) => <FestivalRegistrationStatus festival={row.original} />,
    enableSorting: false,
    enableGlobalFilter: false,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">{columnTitles.actions}</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <FestivalActionsMenu festival={row.original} showSections />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { align: "right" },
  },
];
