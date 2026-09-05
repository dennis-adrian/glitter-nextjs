"use client";

import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
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

  /**
   * Holding access on a stand that is not half of anything. Stated calmly
   * rather than as a warning: nothing went wrong and nothing was lost, this
   * stand simply is not a table. The credits stay where they are.
   */
  if (selection.kind === "single") {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
        <div className="w-20 shrink-0">
          {/* Not the bare `half`: at this size a lone table reads as a whole
              one. The muted neighbour is what makes "only this stand" land. */}
          <FullTableGraphic variant="half-highlighted" />
        </div>
        <div>
          <p className="text-sm font-semibold">Este espacio es un solo stand</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Este espacio no forma parte de una mesa completa. Si lo seleccionás
            vas a reservar solo un stand (media mesa, 120 × 60 cm). Tus créditos
            no se usarán y podrás aplicarlos al pago de tu reserva, o podés
            elegir otra mesa.
          </p>
        </div>
      </div>
    );
  }

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

  /**
   * The pair is whole and they could activate right now. Same news as `full`,
   * with the fee named — this is the moment they decide to spend it.
   */
  if (selection.kind === "offer") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <div className="w-20 shrink-0">
          <FullTableGraphic variant="full" />
        </div>
        <div>
          <p className="text-sm font-semibold">Podés tomar la mesa completa</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Este espacio y el {companionLabel} forman una mesa de 240 × 60 cm.
            Activarla usa {formatCreditCount(selection.creditPrice)} y reserva
            los dos espacios.
          </p>
        </div>
      </div>
    );
  }

  // Everything remaining is the fallback. Named rather than left to fall
  // through: a bare trailing return is what let the activation offer render as
  // "el otro espacio ya está ocupado" when it plainly was not.
  if (selection.kind !== "fallback") return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="w-20 shrink-0">
        <FullTableGraphic variant="companion-unavailable" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-900">
          La mesa completa ya no está disponible
        </p>
        <p className="mt-1 text-sm text-amber-800">
          {companionLabel
            ? `El espacio ${companionLabel} ya está ocupado. `
            : "La otra mitad no está disponible. "}
          Podés seleccionarlo y reservar un solo stand (media mesa, 120 × 60
          cm), Tus créditos no se usarán y podrás aplicarlos al pago de tu
          reserva, o podés elegir otra mesa.
        </p>
      </div>
    </div>
  );
}
