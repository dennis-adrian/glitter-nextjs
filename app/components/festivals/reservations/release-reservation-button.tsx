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
import BuyFeatureCreditsButton from "@/app/components/credits/buy-feature-credits-button";
import { Button } from "@/app/components/ui/button";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { releaseReservationAction } from "@/app/lib/reservations/release-actions";

/**
 * Gives up an unpaid reservation for a fee (PRD §9).
 *
 * Behind a confirmation because the stand goes straight back on the map, where
 * somebody else can take it before the participant finishes changing their
 * mind. The dialog says that plainly rather than promising it will be waiting.
 *
 * When the balance is short the button is replaced by the purchase, not shown
 * disabled next to it: buying the exact shortfall is the next step, and an
 * inert button with a price beside it makes people hunt for the way forward.
 */
export default function ReleaseReservationButton({
  reservationId,
  festivalId,
  creditPrice,
  shortfall,
  standLabel,
}: {
  reservationId: number;
  festivalId: number;
  creditPrice: number;
  /** Credits still needed; zero when the balance already covers it. */
  shortfall: number;
  /** What they are giving up, so the dialog names it. */
  standLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (shortfall > 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Liberar tu reserva cuesta {formatCreditCount(creditPrice)}. Te faltan{" "}
          {formatCreditCount(shortfall)}.
        </p>
        <BuyFeatureCreditsButton
          festivalId={festivalId}
          featureType="reservation_release"
          shortfallAmount={shortfall}
        />
      </div>
    );
  }

  function confirm() {
    startTransition(async () => {
      let result;
      try {
        result = await releaseReservationAction({
          reservationId,
          idempotencyKey: crypto.randomUUID(),
        });
      } catch (error) {
        console.error("Error releasing reservation", error);
        toast.error("No se pudo liberar la reserva. Intentá nuevamente.");
        return;
      }

      if (!result.success) {
        toast.error(result.message);
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
        className="w-full"
        onClick={() => setOpen(true)}
      >
        Liberar reserva ({formatCreditCount(creditPrice)})
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Liberar tu reserva?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  Vas a dejar el espacio {standLabel} y volverá al mapa
                  enseguida. Otra persona puede tomarlo, así que no podemos
                  guardártelo si cambiás de idea.
                </p>
                <p>
                  Vas a poder hacer otra reserva si todavía queda espacio libre,
                  o sumarte como compañero de otra persona.
                </p>
                <p>
                  Se van a usar {formatCreditCount(creditPrice)} y no se
                  devuelven. No se te cobra el precio del espacio, porque
                  todavía no lo pagaste.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              No, mantener mi reserva
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click; the transition needs the dialog to
                // stay up until the action answers.
                event.preventDefault();
                confirm();
              }}
              disabled={pending}
            >
              {pending ? "Liberando…" : "Sí, liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
