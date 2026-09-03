"use client";

import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { formatCredits } from "@/app/components/credits/credit-amount";
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
import { resolveCreditDebtAction } from "@/app/lib/credits/actions";

type CreditDebtResolveDialogProps = {
  userId: number;
  participantName: string;
  debtAmount: number;
  canResolve: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function CreditDebtResolveDialog({
  userId,
  participantName,
  debtAmount,
  canResolve,
  open,
  onOpenChange,
}: CreditDebtResolveDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Null means "untouched", so the field follows the current debt instead of
  // freezing the value this dialog first mounted with. A partial resolution
  // refreshes the page with the dialog still mounted, and a stale default
  // would then offer an amount that no longer matches what is owed.
  const [editedAmount, setEditedAmount] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const amount = editedAmount ?? debtAmount.toFixed(2);

  const parsedAmount = Number(amount);
  // Mirrors resolveCreditDebtSchema, including its multipleOf(0.01): without
  // the precision check a third decimal passes here, then fails server-side
  // as a generic "Datos inválidos" with no hint pointing at the amount.
  const amountValid =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= debtAmount &&
    Math.abs(roundCredits(parsedAmount) - parsedAmount) < 1e-9;
  const canSubmit = canResolve && amountValid && reason.trim().length > 0;

  function resolve(resolution: "mark_paid" | "waive") {
    startTransition(async () => {
      try {
        const result = await resolveCreditDebtAction({
          userId,
          amount: parsedAmount,
          resolution,
          reason: reason.trim(),
          idempotencyKey: crypto.randomUUID(),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setReason("");
        setEditedAmount(null);
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Error resolving credit debt", error);
        toast.error("No se pudo regularizar el saldo. Intentá nuevamente.");
      }
    });
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) {
          setReason("");
          setEditedAmount(null);
        }
        onOpenChange(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Regularizar saldo
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            {participantName} debe {formatCredits(debtAmount)}
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-6 md:px-0 md:pb-0">
          <Alert>
            <AlertCircleIcon className="h-4 w-4" />
            <AlertDescription>
              Esto solo corrige el saldo. La reserva, el compañero o la
              liberación que se pagaron con esos créditos quedan como están.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor={`debt-amount-${userId}`}
            >
              Monto a regularizar
            </label>
            <Input
              id={`debt-amount-${userId}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={debtAmount}
              value={amount}
              onChange={(event) => setEditedAmount(event.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Podés regularizar una parte. El máximo es{" "}
              {formatCredits(debtAmount)}.
            </p>
            {!amountValid && amount.trim() !== "" && (
              <p className="text-xs text-red-600">
                Ingresá un monto mayor a 0, con hasta dos decimales, y menor o
                igual a {formatCredits(debtAmount)}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor={`debt-reason-${userId}`}
            >
              Motivo
            </label>
            <Textarea
              id={`debt-reason-${userId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej: transferencia recibida por otro medio."
              maxLength={1000}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Queda registrado en el libro de créditos junto con tu usuario.
            </p>
          </div>

          {!canResolve && (
            <p className="text-sm text-muted-foreground">
              Solo un administrador general puede regularizar un saldo.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => resolve("mark_paid")}
              disabled={!canSubmit || isPending}
            >
              {isPending ? "Guardando..." : "Marcar como pagado"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => resolve("waive")}
              disabled={!canSubmit || isPending}
            >
              {isPending ? "Guardando..." : "Condonar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Marcá como pagado cuando el participante pagó por otro medio.
              Condoná cuando Glitter absorbe el monto.
            </p>
          </div>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
