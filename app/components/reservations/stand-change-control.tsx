"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { Label } from "@/app/components/ui/label";
import SearchableSelect from "@/app/components/ui/searchable-select";
import {
  toStandChangeChoices,
  type StandChangeChoice,
} from "@/app/components/reservations/stand-change-options";
import { changeReservationStandAction } from "@/app/lib/reservations/stand-change-actions";
import type { StandChangeOption } from "@/app/lib/reservations/stand-change-queries";

/**
 * Moves a reservation to another stand, exchanging with whoever is there.
 *
 * Participants have no free stand swap — release is a paid change fee, and the
 * fee is what stops the map churning. This is the admin's correction for a
 * placement that is simply wrong, and it exists so the fix is not "delete the
 * reservation and build it again", which would throw away the invoice, the
 * payment state, and the audit trail.
 */
export default function StandChangeControl({
  reservationId,
  currentStandId,
  currentStandLabel,
  options,
  disabledReason,
}: {
  reservationId: number;
  currentStandId: number;
  currentStandLabel: string;
  options: StandChangeOption[];
  /**
   * Why this reservation cannot be moved, when it cannot. Set it and the
   * control stays visible but inert: the service refuses the call anyway, and
   * an admin who cannot act should see the action exists rather than wonder
   * where it went.
   */
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [selectedStandId, setSelectedStandId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Held across retries, not minted per submit. A request whose response is
  // lost has still been claimed by the registry: retrying with the same key
  // replays its result, while a fresh key would run a second move. Only an
  // explicit refusal — which proves the server decided — earns a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const choices = useMemo(
    () => toStandChangeChoices(options, currentStandId),
    [options, currentStandId],
  );
  const selectOptions = useMemo(
    () =>
      choices.map((choice) => ({
        value: String(choice.standId),
        label: choice.disabledReason
          ? `${choice.label} — ${choice.disabledReason}`
          : choice.exchangeWith
            ? `${choice.label} — ocupado por ${choice.exchangeWith}`
            : choice.label,
        disabled: choice.disabledReason != null,
      })),
    [choices],
  );
  const selected: StandChangeChoice | undefined = choices.find(
    (choice) => String(choice.standId) === selectedStandId,
  );
  const isExchange = selected?.exchangeWith != null;

  function confirm() {
    if (!selected) return;
    startTransition(async () => {
      let result;
      try {
        result = await changeReservationStandAction({
          reservationId,
          destinationStandId: selected.standId,
          idempotencyKey,
          allowExchange: isExchange,
        });
      } catch (error) {
        console.error("Error changing reservation stand", error);
        toast.error("No se pudo mover la reserva. Intentá nuevamente.");
        return;
      }

      if (!result.success) {
        toast.error(result.message);
        setIdempotencyKey(crypto.randomUUID());
        return;
      }

      toast.success(result.message);
      setOpen(false);
      setSelectedStandId("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    });
  }

  return (
    <div>
      {/* Heading and blurb live on the section card now, so the control is just
          the control. */}
      <div className="space-y-2">
        <Label htmlFor="stand-change-destination">Espacio de destino</Label>
        {/* Searchable rather than a plain dropdown: a festival can have two
            hundred stands, and scrolling to one by eye is not a way to find
            it. The whole label is searchable, so a number, a sector, a
            category or a price all narrow the list. */}
        <SearchableSelect
          id="stand-change-destination"
          value={selectedStandId}
          onValueChange={setSelectedStandId}
          options={selectOptions}
          placeholder="Buscar o seleccionar espacio"
          searchPlaceholder="Buscar por número, sector o categoría..."
          emptyLabel="Ningún espacio coincide."
          disabled={disabledReason != null || pending}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        disabled={disabledReason != null || selected == null || pending}
        title={disabledReason ?? undefined}
        onClick={() => setOpen(true)}
      >
        {isExchange ? "Intercambiar espacios" : "Mover reserva"}
      </Button>
      {disabledReason && (
        <p className="mt-2 text-xs text-muted-foreground">{disabledReason}</p>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isExchange
                ? "¿Intercambiar los dos espacios?"
                : "¿Mover la reserva a este espacio?"}
            </AlertDialogTitle>
            {/* Everything that moves, and everything that deliberately does
                not. An exchange touches somebody who did not ask for it, so it
                says whose reservation is on the other side before it runs. */}
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                {isExchange ? (
                  <p>
                    La reserva pasa de {currentStandLabel} a {selected?.label},
                    y la reserva de {selected?.exchangeWith} se queda con{" "}
                    {currentStandLabel}. Se mueven las dos.
                  </p>
                ) : (
                  <p>
                    La reserva pasa de {currentStandLabel} a {selected?.label}.{" "}
                    {currentStandLabel} vuelve a estar disponible en el mapa y
                    otro participante puede tomarlo enseguida.
                  </p>
                )}
                <p>
                  {isExchange ? "Cada cobro pasa" : "El cobro pasa"} a ser el
                  del espacio nuevo, manteniendo el descuento que ya tenía. Los
                  participantes y los pagos registrados quedan como están.
                </p>
                <p>
                  Si el espacio nuevo cuesta más de lo ya pagado, la reserva
                  vuelve a quedar pendiente por la diferencia, con cinco días
                  para pagarla. Si cuesta menos, lo pagado de más vuelve como
                  créditos.
                </p>
                <p>
                  Si hay un comprobante en revisión, el cambio de precio se
                  rechaza hasta que se resuelva.
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
              {pending
                ? "Moviendo…"
                : isExchange
                  ? "Intercambiar"
                  : "Mover reserva"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
