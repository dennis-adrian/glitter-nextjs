"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Button } from "@/app/components/ui/button";
import { downgradeFullTableReservationAction } from "@/app/lib/reservations/full-table-actions";

/**
 * Reduces a full table to the half the participant originally selected
 * (PRD §7.7, §13).
 *
 * This is the only sanctioned way out when the credits behind a full table are
 * reversed: nothing downgrades automatically, so an admin decides case by case
 * whether to ask for replacement payment, waive the debt, or come here. Behind
 * a confirmation because it hands a stand back to the map, where somebody else
 * can take it before anyone changes their mind.
 */
export default function FullTableDowngradeButton({
  reservationId,
  keptStandLabel,
  releasedStandLabel,
  disabledReason,
  tablePriced = true,
}: {
  reservationId: number;
  /** The half the reservation keeps: member position 0. */
  keptStandLabel: string;
  /** The companion that goes back on the map. */
  releasedStandLabel: string;
  /**
   * Why the downgrade cannot run, when it cannot: this viewer is not a global
   * admin, or real money sits on the cobro. Set it and the button stays
   * visible but inert: the service refuses the call anyway, and an admin
   * should see the action exists and what stands in its way rather than
   * wonder where it went.
   */
  disabledReason?: string;
  /**
   * Whether the table was priced as a table (`full_table_price_snapshot`).
   * Only then does the money rule apply: a full table from before table
   * pricing is never refused for money, so the dialog does not state a rule
   * the page itself would contradict.
   */
  tablePriced?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Held across retries, not minted per submit. A request whose response is
  // lost has still been claimed by the registry: retrying with the same key
  // replays its result, while a fresh key would run a second downgrade or report a
  // failure for something that in fact succeeded. Only an explicit refusal —
  // which proves the server decided — earns a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function confirm() {
    startTransition(async () => {
      let result;
      try {
        result = await downgradeFullTableReservationAction({
          reservationId,
          idempotencyKey,
        });
      } catch (error) {
        console.error("Error downgrading full table", error);
        toast.error("No se pudo reducir la mesa. Intentá nuevamente.");
        return;
      }

      if (!result.success) {
        toast.error(result.message);
        setIdempotencyKey(crypto.randomUUID());
        return;
      }

      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabledReason != null}
        title={disabledReason}
        onClick={() => setOpen(true)}
      >
        Reducir a media mesa
      </Button>
      {disabledReason && (
        <p className="mt-2 text-xs text-muted-foreground">{disabledReason}</p>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Reducir la reserva a media mesa?
            </AlertDialogTitle>
            {/* Everything this changes, and everything it deliberately does
                not: the money side is a separate decision the admin makes in
                the wallet, and saying so here stops this reading like a
                refund. It never says payments "stay as they are": the service
                refuses whenever there is real money on a table-priced cobro,
                and the page disables this button for exactly that. */}
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  La reserva se queda con el espacio {keptStandLabel} y{" "}
                  {releasedStandLabel} vuelve a estar disponible en el mapa.
                  Otro participante puede tomarlo enseguida.
                </p>
                <p>
                  El cobro pasa a ser el de un solo espacio, manteniendo el
                  descuento que ya tenía.{" "}
                  {tablePriced &&
                    "Solo se puede reducir mientras el cobro no tenga pagos aprobados, comprobantes o solicitudes en revisión ni créditos aplicados. "}
                  Los participantes quedan como están.
                </p>
                <p>
                  Los créditos de la mesa completa no se devuelven. Si quedó
                  deuda por un comprobante rechazado, se resuelve aparte desde
                  la billetera.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click; the transition needs the dialog to
                // stay up until the action answers.
                event.preventDefault();
                confirm();
              }}
              disabled={pending}
            >
              {pending ? "Reduciendo…" : "Reducir a media mesa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
