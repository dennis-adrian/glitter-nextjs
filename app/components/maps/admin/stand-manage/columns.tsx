"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangleIcon, EditIcon } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import { cn } from "@/lib/utils";

import {
  CATEGORY_OPTIONS,
  STAND_STATUS_OPTIONS,
  StandCategory,
  StandStatus,
  formatPrice,
  getCategoryLabel,
  standDisplayLabel,
} from "@/app/components/maps/admin/stand-manage/shared";

import type { FullTableInfo } from "@/app/components/maps/admin/stand-manage/full-table";

export type StandRow = StandWithReservationsWithParticipants & {
  sectorId: number;
  sectorName: string;
};

export const columnTitles = {
  select: "",
  label: "Stand",
  sector: "Sector",
  status: "Estado",
  standCategory: "Categoría",
  price: "Precio",
  fullTable: "Mesa completa",
  reservation: "Reserva",
  actions: "",
};

type ColumnOpts = {
  onEdit: (stand: StandRow) => void;
  onQuickStatus: (stand: StandRow, status: StandStatus) => void;
  pendingQuickStatusId: number | null;
  isSelected: (id: number) => boolean;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], allOn: boolean) => void;
  /** Keyed by stand id; absent means the stand is not half of a full table. */
  fullTableByStandId: Map<number, FullTableInfo>;
};

/**
 * A stand's half of a declared table, or a dash.
 *
 * A malformed pair is shown rather than hidden: it is invisible to
 * participants, and it silently withholds every full table in its sector until
 * an admin fixes it, so this table is the only place it can surface.
 */
function FullTableCell({ info }: { info: FullTableInfo | undefined }) {
  if (!info) return <span className="text-sm text-muted-foreground">—</span>;

  if (info.problems.length > 0) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            aria-label="Ver los problemas de esta mesa completa"
          >
            <Badge variant="amber" className="gap-1">
              <AlertTriangleIcon className="h-3 w-3" />
              Mesa con problemas
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-sm" align="start">
          <p className="mb-2 font-medium">
            Esta mesa no cumple las reglas, así que no se le ofrece a nadie:
          </p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {info.problems.map((problem, index) => (
              <li key={index}>{problem.message}</li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Badge
        variant={info.fullTablePrice == null ? "amber" : "secondary"}
        className="w-fit"
      >
        Mesa completa
      </Badge>
      <span className="text-xs text-muted-foreground">
        {info.companion
          ? `con ${standDisplayLabel(info.companion)}`
          : "sin la otra mitad"}
      </span>
      {/* An unpriced table is withheld from participants, so the gap has to be
          as visible here as a malformed pair is. */}
      <span
        className={cn(
          "text-xs tabular-nums",
          info.fullTablePrice == null
            ? "font-medium text-amber-700"
            : "text-muted-foreground",
        )}
      >
        {info.fullTablePrice == null
          ? "Sin precio"
          : formatPrice(info.fullTablePrice)}
      </span>
    </div>
  );
}

function StatusCell({
  stand,
  onQuickStatus,
  isPending,
}: {
  stand: StandRow;
  onQuickStatus: (stand: StandRow, status: StandStatus) => void;
  isPending: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center rounded-md transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            isPending && "opacity-50",
          )}
          aria-label={`Cambiar estado de ${standDisplayLabel(stand)}`}
          disabled={isPending}
        >
          <StandStatusBadge status={stand.status} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="flex flex-col gap-0.5">
          {STAND_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onQuickStatus(stand, opt.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                stand.status === opt.value && "font-semibold",
              )}
            >
              <StandStatusBadge status={opt.value} />
              {opt.value === stand.status && (
                <span className="ml-auto text-xs text-muted-foreground">
                  actual
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function createColumns({
  onEdit,
  onQuickStatus,
  pendingQuickStatusId,
  isSelected,
  onToggle,
  onToggleAll,
  fullTableByStandId,
}: ColumnOpts): ColumnDef<StandRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => {
        const ids = table.getFilteredRowModel().rows.map((r) => r.original.id);
        const allOn = ids.length > 0 && ids.every((id) => isSelected(id));
        const someOn = !allOn && ids.some((id) => isSelected(id));
        return (
          <Checkbox
            checked={allOn ? true : someOn ? "indeterminate" : false}
            onCheckedChange={() => onToggleAll(ids, allOn)}
            aria-label="Seleccionar todos"
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={isSelected(row.original.id)}
          onCheckedChange={() => onToggle(row.original.id)}
          aria-label={`Seleccionar ${standDisplayLabel(row.original)}`}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "label",
      id: "label",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.label} />
      ),
      accessorFn: (row) => standDisplayLabel(row),
      cell: ({ row }) => {
        const hasReservation = row.original.reservations.length > 0;
        return (
          <div className="flex items-center gap-2 pl-2">
            {hasReservation && (
              <>
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                />
                {/* The stripe this replaced was invisible to screen readers. */}
                <span className="sr-only">Con reserva</span>
              </>
            )}
            <span className="text-sm font-medium">
              {standDisplayLabel(row.original)}
            </span>
          </div>
        );
      },
      sortingFn: (a, b) => {
        const an = a.original.standNumber;
        const bn = b.original.standNumber;
        return an - bn || a.original.id - b.original.id;
      },
    },
    {
      accessorKey: "sectorName",
      id: "sector",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.sector} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.sectorName}</span>
      ),
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue?.length) return true;
        return filterValue.includes(String(row.original.sectorId));
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.status} />
      ),
      cell: ({ row }) => (
        <StatusCell
          stand={row.original}
          onQuickStatus={onQuickStatus}
          isPending={pendingQuickStatusId === row.original.id}
        />
      ),
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue?.length) return true;
        return filterValue.includes(row.original.status);
      },
    },
    {
      accessorKey: "standCategory",
      id: "standCategory",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.standCategory}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {getCategoryLabel(row.original.standCategory as StandCategory)}
        </span>
      ),
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue?.length) return true;
        return filterValue.includes(row.original.standCategory);
      },
    },
    {
      accessorKey: "price",
      id: "price",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.price} />
      ),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {formatPrice(row.original.price ?? 0)}
        </span>
      ),
    },
    {
      id: "fullTable",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.fullTable} />
      ),
      cell: ({ row }) => (
        <FullTableCell info={fullTableByStandId.get(row.original.id)} />
      ),
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue?.length) return true;
        const info = fullTableByStandId.get(row.original.id);
        // Every state an admin has to act on is selectable, so a festival's
        // worth of stands can be narrowed to the ones still waiting on them.
        const state = !info
          ? "none"
          : info.problems.length > 0
            ? "problems"
            : info.fullTablePrice == null
              ? "unpriced"
              : "priced";
        return filterValue.includes(state);
      },
      enableSorting: false,
    },
    {
      id: "reservation",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.reservation}
        />
      ),
      accessorFn: (row) => (row.reservations.length > 0 ? "yes" : "no"),
      cell: ({ row }) => {
        const hasReservation = row.original.reservations.length > 0;
        return hasReservation ? (
          <Badge variant="secondary" className="text-xs">
            Con reserva
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue?.length) return true;
        const has = row.original.reservations.length > 0 ? "yes" : "no";
        return filterValue.includes(has);
      },
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(row.original)}
            aria-label={`Editar ${standDisplayLabel(row.original)}`}
          >
            <EditIcon className="mr-1 h-4 w-4" />
            Editar
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function standFilterOptions() {
  return {
    status: STAND_STATUS_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label,
    })),
    category: CATEGORY_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label,
    })),
    reservation: [
      { value: "yes", label: "Con reserva" },
      { value: "no", label: "Sin reserva" },
    ],
    fullTable: [
      { value: "priced", label: "Mesa completa con precio" },
      { value: "unpriced", label: "Mesa completa sin precio" },
      { value: "problems", label: "Mesa con problemas" },
      { value: "none", label: "Sin mesa completa" },
    ],
  };
}
