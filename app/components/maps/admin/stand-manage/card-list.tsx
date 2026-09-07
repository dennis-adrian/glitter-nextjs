"use client";

import { EditIcon } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import { cn } from "@/lib/utils";

import {
  StandCategory,
  formatPrice,
  getCategoryLabel,
  standDisplayLabel,
} from "@/app/components/maps/admin/stand-manage/shared";
import { StandRow } from "@/app/components/maps/admin/stand-manage/columns";
import type { FullTableInfo } from "@/app/components/maps/admin/stand-manage/full-table";

type Props = {
  stands: StandRow[];
  selectedIds: Set<number>;
  fullTableByStandId: Map<number, FullTableInfo>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], allOn: boolean) => void;
  onEdit: (stand: StandRow) => void;
};

export default function StandManageCardList({
  stands,
  selectedIds,
  fullTableByStandId,
  onToggle,
  onToggleAll,
  onEdit,
}: Props) {
  if (stands.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        Sin resultados.
      </div>
    );
  }

  const allIds = stands.map((s) => s.id);
  const allSelected = allIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some((id) => selectedIds.has(id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 px-1 py-2">
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={() => onToggleAll(allIds, allSelected)}
          aria-label="Seleccionar todos"
        />
        <span className="text-xs text-muted-foreground">
          {stands.length} espacio{stands.length !== 1 ? "s" : ""}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {stands.map((stand) => {
          const isSelected = selectedIds.has(stand.id);
          const hasReservation = stand.reservations.length > 0;
          const fullTable = fullTableByStandId.get(stand.id);
          return (
            <li
              key={stand.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-background px-3 py-3 transition-colors",
                isSelected && "bg-muted/50",
                hasReservation && "border-emerald-300",
              )}
            >
              <Checkbox
                className="mt-1"
                checked={isSelected}
                onCheckedChange={() => onToggle(stand.id)}
                aria-label={`Seleccionar ${standDisplayLabel(stand)}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    Stand {standDisplayLabel(stand)}
                  </span>
                  <StandStatusBadge status={stand.status} />
                  {hasReservation && (
                    <Badge variant="secondary" className="text-xs">
                      Con reserva
                    </Badge>
                  )}
                  {fullTable && (
                    <Badge
                      variant={
                        fullTable.problems.length > 0 ? "amber" : "secondary"
                      }
                      className="text-xs"
                    >
                      {fullTable.problems.length > 0
                        ? "Mesa con problemas"
                        : "Mesa completa"}
                    </Badge>
                  )}
                </div>

                {/* Named here too: a malformed pair is invisible to
                    participants and withholds every full table in its sector. */}
                {fullTable && fullTable.problems.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-amber-700">
                    {fullTable.problems.map((problem, index) => (
                      <li key={index}>{problem.message}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{stand.sectorName}</span>
                  <span>·</span>
                  <span>
                    {getCategoryLabel(stand.standCategory as StandCategory)}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {formatPrice(stand.price ?? 0)}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(stand)}
                aria-label={`Editar ${standDisplayLabel(stand)}`}
              >
                <EditIcon className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
