"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import BuyLatePartnerCreditsButton from "@/app/components/festivals/reservations/buy-late-partner-credits-button";
import { addLatePartnerAction } from "@/app/lib/reservations/late-partner-actions";
import { searchPotentialPartners } from "@/app/lib/reservations/participant-actions";

type PartnerOption = { id: number; displayName: string | null };

/**
 * `Agregar compañero` (PRD §8.3).
 *
 * Two things have to be clear before anybody commits: who is being added, and
 * that the price is two separate charges — the difference between what one
 * person and two people cost on this stand, plus the fee for adding somebody
 * after booking. Showing only a total invites the question "why that much?",
 * which is exactly the question §8.3 asks us to answer up front.
 *
 * When the balance is short the purchase replaces the confirm button rather
 * than sitting disabled beside it: credits are the only way to fund this, so
 * buying them is the next step, not an obstacle.
 */
export default function AddLatePartnerButton({
  reservationId,
  festivalId,
  sharedPriceDifference,
  featurePrice,
  totalCredits,
  shortfall,
  deadlineLabel,
}: {
  reservationId: number;
  festivalId: number;
  sharedPriceDifference: number;
  featurePrice: number;
  totalCredits: number;
  shortfall: number;
  /** The effective deadline, already formatted. Always shown (§5). */
  deadlineLabel: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<PartnerOption[]>([]);
  const [selected, setSelected] = useState<PartnerOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  const search = useDebouncedCallback(async (value: string) => {
    if (value.trim().length < 2) {
      setOptions([]);
      return;
    }
    setSearching(true);
    try {
      const found = await searchPotentialPartners(festivalId, value);
      setOptions(found as PartnerOption[]);
    } catch (error) {
      console.error("Error searching partners", error);
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, 300);

  function confirm() {
    if (!selected) return;
    startTransition(async () => {
      let result;
      try {
        result = await addLatePartnerAction({
          reservationId,
          partnerUserId: selected.id,
          idempotencyKey: crypto.randomUUID(),
        });
      } catch (error) {
        console.error("Error adding partner", error);
        toast.error("No se pudo agregar a tu compañero. Intentá nuevamente.");
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
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        Agregar compañero
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Agregar un compañero</DialogTitle>
            <DialogDescription>
              Vas a compartir tu espacio con otra persona. Vos seguís siendo
              quien paga la reserva.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="late-partner-search">
                Buscá a tu compañero por nombre
              </Label>
              <Input
                id="late-partner-search"
                value={term}
                placeholder="Nombre o usuario"
                onChange={(event) => {
                  setTerm(event.target.value);
                  setSelected(null);
                  search(event.target.value);
                }}
              />
              {searching && (
                <p className="text-xs text-muted-foreground">Buscando…</p>
              )}
              {!searching &&
                term.trim().length >= 2 &&
                options.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No encontramos a nadie que pueda sumarse con ese nombre.
                  </p>
                )}
              {options.length > 0 && (
                <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                  {options.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(option)}
                        aria-pressed={selected?.id === option.id}
                        className={`w-full px-3 py-2 text-left text-sm ${
                          selected?.id === option.id
                            ? "bg-muted font-medium"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        {option.displayName ?? `Participante ${option.id}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Both components named, not just the total (§8.3). */}
            <dl className="space-y-1 rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  Diferencia por compartir el espacio
                </dt>
                <dd>{formatCreditCount(sharedPriceDifference)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  Agregar después de reservar
                </dt>
                <dd>{formatCreditCount(featurePrice)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-1 font-medium">
                <dt>Total</dt>
                <dd>{formatCreditCount(totalCredits)}</dd>
              </div>
            </dl>

            <p className="text-sm text-muted-foreground">
              Tu factura original no cambia. Esto se paga aparte, con créditos.
              {deadlineLabel
                ? ` Podés agregar a alguien hasta el ${deadlineLabel}.`
                : null}
            </p>
          </div>

          <DialogFooter>
            {shortfall > 0 ? (
              <div className="w-full space-y-2">
                <p className="text-sm text-muted-foreground">
                  Te faltan {formatCreditCount(shortfall)}.
                </p>
                <BuyLatePartnerCreditsButton reservationId={reservationId} />
              </div>
            ) : (
              <Button
                type="button"
                onClick={confirm}
                disabled={pending || !selected}
              >
                {pending
                  ? "Agregando…"
                  : selected
                    ? `Agregar a ${selected.displayName ?? "esta persona"}`
                    : "Elegí a alguien primero"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
