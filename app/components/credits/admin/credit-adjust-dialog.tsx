"use client";

import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { roundCredits } from "@/app/lib/credits/balances";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { adjustCreditAccountAction } from "@/app/lib/credits/actions";

type CreditAdjustDialogProps = {
  userId: number;
  participantName: string;
  canAdjust: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Hands credits to a participant, or takes them back.
 *
 * There is no payment behind it, which is exactly why the reason is required:
 * the ledger entry is the only record of why the balance moved, and it is the
 * one the participant sees in their own movements.
 */
export default function CreditAdjustDialog({
  userId,
  participantName,
  canAdjust,
  open,
  onOpenChange,
}: CreditAdjustDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  // Minted once per attempt rather than per call, so a double submit of the
  // same adjustment lands as one ledger entry instead of two.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const parsedAmount = Number(amount);
  // Mirrors adjustCreditAccountSchema, including its two-decimal precision:
  // without the check a third decimal fails server-side as a bare "Datos
  // inválidos" with nothing pointing at the amount.
  const amountValid =
    amount.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    Math.abs(roundCredits(parsedAmount) - parsedAmount) < 1e-9;
  const canSubmit = canAdjust && amountValid && reason.trim().length > 0;

  function reset() {
    setAmount("");
    setReason("");
  }

  function adjust(direction: 1 | -1) {
    startTransition(async () => {
      try {
        const result = await adjustCreditAccountAction({
          userId,
          amount: roundCredits(parsedAmount) * direction,
          reason: reason.trim(),
          idempotencyKey,
        });
        if (!result.success) {
          toast.error(result.message);
          setIdempotencyKey(crypto.randomUUID());
          return;
        }
        toast.success(result.message);
        setIdempotencyKey(crypto.randomUUID());
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Error adjusting credit account", error);
        toast.error("No se pudo ajustar el saldo. Intentá nuevamente.");
        setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Asignar créditos
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            A la cuenta de {participantName}
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-6 md:px-0 md:pb-0">
          <Alert>
            <AlertCircleIcon className="h-4 w-4" />
            <AlertDescription>
              El movimiento queda en el historial del participante con el motivo
              que escribas. Los créditos quedan disponibles al instante.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor={`adjust-amount-${userId}`}
            >
              Cantidad de créditos
            </label>
            <Input
              id={`adjust-amount-${userId}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Ej: 20"
              disabled={isPending}
            />
            {!amountValid && amount.trim() !== "" && (
              <p className="text-xs text-red-600">
                Ingresá una cantidad mayor a 0, con hasta dos decimales.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor={`adjust-reason-${userId}`}
            >
              Motivo
            </label>
            <Textarea
              id={`adjust-reason-${userId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej: compensación por una reserva caída."
              maxLength={1000}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Lo ve el participante en sus movimientos.
            </p>
          </div>

          {!canAdjust && (
            <p className="text-sm text-muted-foreground">
              Solo un administrador general puede ajustar un saldo.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => adjust(1)}
              disabled={!canSubmit || isPending}
            >
              {isPending
                ? "Guardando..."
                : `Otorgar ${amountValid ? formatCreditCount(roundCredits(parsedAmount)) : "créditos"}`}
            </Button>
            {/* Taking credits back is the same entry with the sign flipped, so
                it belongs here rather than in a second dialog. It can leave the
                account in debt, which is what the debt report is for. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => adjust(-1)}
              disabled={!canSubmit || isPending}
            >
              {isPending ? "Guardando..." : "Descontar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Descontar puede dejar el saldo en negativo, y un saldo negativo
              bloquea todo uso de créditos hasta regularizarlo.
            </p>
          </div>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
