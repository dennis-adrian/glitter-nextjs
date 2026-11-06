"use client";

import { useState } from "react";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
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
import { Input } from "@/app/components/ui/input";
import { roundCredits } from "@/app/lib/credits/balances";
import { requiresTypedConfirmation } from "@/app/lib/credit_gifts/definitions";

type CreditGiftConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eligibleCount: number;
  skippedCount: number;
  amountPerRecipient: number;
  total: number;
  isPending: boolean;
  onConfirm: (confirmedTotal: number | undefined) => void;
};

/**
 * Restates who gets what before any credit moves. A large total has to be
 * typed, so a slip between 20 and 200 cannot pass on a reflex click.
 */
export default function CreditGiftConfirmDialog({
  open,
  onOpenChange,
  eligibleCount,
  skippedCount,
  amountPerRecipient,
  total,
  isPending,
  onConfirm,
}: CreditGiftConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const needsTyping = requiresTypedConfirmation(total);
  const typedMatches =
    typed.trim() !== "" && roundCredits(Number(typed)) === total;
  const totalLabel = formatCreditCount(total);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Regalar {totalLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Los créditos se acreditan al confirmar. Después se pueden retirar,
            pero no editar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Participantes</dt>
          <dd className="text-right tabular-nums">{eligibleCount}</dd>
          <dt className="text-muted-foreground">Créditos por persona</dt>
          <dd className="text-right tabular-nums">
            {formatCreditCount(amountPerRecipient)}
          </dd>
          {skippedCount > 0 && (
            <>
              <dt className="text-muted-foreground">Omitidos</dt>
              <dd className="text-right tabular-nums">{skippedCount}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Avisos</dt>
          <dd className="text-right">En la app y por correo</dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right text-lg font-bold tabular-nums">
            {totalLabel}
          </dd>
        </dl>

        {needsTyping && (
          <div className="space-y-2">
            <label htmlFor="credit-gift-typed-total" className="text-sm">
              Escribí <strong className="tabular-nums">{total}</strong> para
              confirmar
            </label>
            <Input
              id="credit-gift-typed-total"
              inputMode="decimal"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={isPending}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || (needsTyping && !typedMatches)}
            onClick={(event) => {
              // Kept open until the action answers, so a failure is read in
              // context instead of after the dialog has gone.
              event.preventDefault();
              onConfirm(needsTyping ? Number(typed) : undefined);
            }}
          >
            {isPending ? "Regalando…" : `Regalar ${totalLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
