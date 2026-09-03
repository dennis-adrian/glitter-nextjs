"use client";

import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { formatStandLabel } from "@/app/lib/stands/helpers";

import type { ReservationMapStandDto } from "@/app/lib/reservations/dto";

/**
 * Stage two of the half-table disclosure (PRD §7.4).
 *
 * Selecting a stand takes capacity immediately, so this is the last moment
 * before a participant who paid for full-table access is committed to half a
 * table. It asks for an explicit acknowledgement rather than letting the
 * selection go through on a click they may have aimed at a whole table.
 */
export default function HalfTableFallbackDialog({
  open,
  stand,
  companion,
  onCancel,
  onConfirm,
  isPending,
}: {
  open: boolean;
  stand: ReservationMapStandDto;
  companion: ReservationMapStandDto | null;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const standLabel = formatStandLabel({
    label: stand.label,
    standNumber: stand.standNumber,
  });
  const companionLabel = companion
    ? formatStandLabel({
        label: companion.label,
        standNumber: companion.standNumber,
      })
    : null;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Esta mesa ya no está disponible completa
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <div className="mx-auto my-3 w-40">
                <FullTableGraphic variant="companion-unavailable" />
              </div>
              <p>
                {companionLabel
                  ? `El espacio ${companionLabel} ya fue tomado. `
                  : "La otra mitad ya no está disponible. "}
                Podés reservar solo el espacio {standLabel} o elegir otra mesa.
              </p>
              <p className="mt-2 font-medium text-foreground">
                Vas a reservar un solo stand (media mesa, 120 × 60 cm), no la
                mesa completa. Tus créditos no se usarán y podrás aplicarlos al
                pago de tu reserva.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            Elegir otra mesa
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            Reservar un solo stand
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
