"use client";

import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";
import { formatStandLabel } from "@/app/lib/stands/helpers";

import type { FullTableSelection } from "@/app/lib/reservations/full-table-selection";

/**
 * Stage one of the half-table disclosure (PRD §7.4): what this stand gives you,
 * shown in the stand detail before anything is selected.
 */
export default function FullTableSelectionNotice({
  selection,
}: {
  selection: FullTableSelection;
}) {
  if (selection.kind === "none") return null;

  const companionLabel = selection.companion
    ? formatStandLabel({
        label: selection.companion.label,
        standNumber: selection.companion.standNumber,
      })
    : null;

  if (selection.kind === "full") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <div className="w-20 shrink-0">
          <FullTableGraphic variant="full" />
        </div>
        <div>
          <p className="text-sm font-semibold">Podés tomar la mesa completa</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Este espacio y el {companionLabel} forman una mesa de 240 × 60 cm.
            Al seleccionarlo se reservan los dos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="w-20 shrink-0">
        <FullTableGraphic variant="companion-unavailable" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-900">
          Esta mesa ya no está disponible completa
        </p>
        <p className="mt-1 text-sm text-amber-800">
          {companionLabel
            ? `El espacio ${companionLabel} ya está ocupado. `
            : "La otra mitad no está disponible. "}
          Si seguís, vas a reservar un solo stand (media mesa, 120 × 60 cm), no
          la mesa completa. Tus créditos no se usarán y vas a poder aplicarlos
          al pago de tu reserva, o podés elegir otra mesa.
        </p>
      </div>
    </div>
  );
}
