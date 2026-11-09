"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { updateCreditLeadDays } from "@/app/lib/festivals/finance/actions";
import {
  DEFAULT_CREDIT_LEAD_DAYS,
  MAX_CREDIT_LEAD_DAYS,
  MIN_CREDIT_LEAD_DAYS,
  resplitMovableCredits,
  type MovablePortion,
} from "@/app/lib/festivals/finance/summary";
import { formatMoney } from "@/app/lib/formatters";

type Props = {
  festivalId: number;
  leadDays: number;
  reservationsStartDate: string;
  movable: MovablePortion[];
  fixedFestivalCredits: number;
  current: { festival: number; earlier: number };
};

function day(date: Date) {
  return DateTime.fromJSDate(date, { zone: "America/La_Paz" })
    .setLocale("es")
    .toFormat("d 'de' LLLL");
}

function parseDays(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const days = Number(value);
  return days >= MIN_CREDIT_LEAD_DAYS && days <= MAX_CREDIT_LEAD_DAYS ? days : null;
}

/**
 * Sets, for one festival, how many days before reservations open a credit
 * purchase counts as its money, with a preview of how the totals move.
 */
export default function CreditLeadDaysDialog({
  festivalId,
  leadDays,
  reservationsStartDate,
  movable,
  fixedFestivalCredits,
  current,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(leadDays));
  const [pending, setPending] = useState(false);

  const days = parseDays(value);
  const preview = useMemo(
    () =>
      days == null
        ? null
        : resplitMovableCredits(
            movable,
            new Date(reservationsStartDate),
            days,
            fixedFestivalCredits,
          ),
    [days, movable, reservationsStartDate, fixedFestivalCredits],
  );
  const changed = days != null && days !== leadDays;

  const onOpenChange = (next: boolean) => {
    if (next) setValue(String(leadDays));
    setOpen(next);
  };

  const save = async () => {
    if (days == null) return;
    setPending(true);
    try {
      const result = await updateCreditLeadDays({ festivalId, leadDays: days });
      if (result.success) {
        toast.success("Guardado. Las cifras ya usan los días nuevos.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("No se pudo guardar. Probá de nuevo.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="font-semibold text-primary underline underline-offset-2"
      >
        Cambiar
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Créditos de esta edición</DialogTitle>
            <DialogDescription>
              Desde cuándo una compra de créditos cuenta como dinero de este
              festival. Las compras hechas para este festival cuentan siempre.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="credit-lead-days">Días antes de abrir las reservas</Label>
            <div className="flex items-center gap-2">
              <Input
                id="credit-lead-days"
                type="number"
                inputMode="numeric"
                min={MIN_CREDIT_LEAD_DAYS}
                max={MAX_CREDIT_LEAD_DAYS}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={pending}
                className="w-24 tabular-nums"
                aria-invalid={days == null}
                aria-describedby="credit-lead-days-hint"
              />
              <span className="text-sm text-muted-foreground">días</span>
            </div>
            <span
              id="credit-lead-days-hint"
              className={days == null ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            >
              {days == null
                ? `Escribí un número entero entre ${MIN_CREDIT_LEAD_DAYS} y ${MAX_CREDIT_LEAD_DAYS}.`
                : `Entre ${MIN_CREDIT_LEAD_DAYS} y ${MAX_CREDIT_LEAD_DAYS}. Si no lo cambiás, son ${DEFAULT_CREDIT_LEAD_DAYS}.`}
            </span>
          </div>

          {preview ? (
            <div className="grid gap-2 rounded-md bg-muted p-3 text-sm" aria-live="polite">
              <div className="flex justify-between gap-3">
                <span>Cuentan las compras desde</span>
                <strong className="font-semibold">{day(preview.windowStart)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span>Créditos de esta edición</span>
                <span className="tabular-nums">
                  {changed ? (
                    <s className="mr-1.5 text-muted-foreground">{formatMoney(current.festival)}</s>
                  ) : null}
                  {formatMoney(preview.festival)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Créditos anteriores</span>
                <span className="tabular-nums">
                  {changed ? (
                    <s className="mr-1.5 text-muted-foreground">{formatMoney(current.earlier)}</s>
                  ) : null}
                  {formatMoney(preview.earlier)}
                </span>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Solo cambia cómo se agrupan los créditos en Finanzas. No toca
            saldos, cobros ni reservas.
          </p>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={pending || !changed}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
