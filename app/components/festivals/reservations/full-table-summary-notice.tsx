import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";

import type { FestivalReservationConfirmationDto } from "@/app/lib/reservations/dto";

/**
 * What the participant is about to commit to, stated in words before the
 * confirm button (PRD §7.4).
 *
 * The fallback case is the one that matters: someone who paid for full-table
 * access and is about to walk away with half a table must be told so in plain
 * language, on the last screen where they can still back out.
 */
export default function FullTableSummaryNotice({
  fullTable,
}: {
  fullTable: FestivalReservationConfirmationDto["fullTable"];
}) {
  if (!fullTable.isFullTable && !fullTable.isHalfTableFallback) return null;

  const stands = fullTable.standLabels.join(" y ");

  if (fullTable.isFullTable) {
    return (
      <div className="mb-4 rounded-lg border bg-card p-4">
        <div className="flex items-start gap-4">
          <div className="w-24 shrink-0">
            <FullTableGraphic variant="full-selected" />
          </div>
          <div>
            <p className="font-medium">Vas a reservar una mesa completa</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Incluye los espacios {stands}: 240 × 60 cm en total. Se van a usar
              tus créditos de mesa completa al confirmar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0">
          <FullTableGraphic variant="companion-unavailable" />
        </div>
        <div>
          <p className="font-medium">
            Esta mesa ya no está disponible completa
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vas a reservar medio stand ({stands}), 120 × 60 cm, no la mesa
            completa. Tus créditos no se usarán y vas a poder aplicarlos al pago
            de tu reserva.
          </p>
        </div>
      </div>
    </div>
  );
}
