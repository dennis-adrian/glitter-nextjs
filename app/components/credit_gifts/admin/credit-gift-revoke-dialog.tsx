"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

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
import { revokeCreditGiftAction } from "@/app/lib/credit_gifts/actions";
import { roundCredits } from "@/app/lib/credits/balances";

export type CreditGiftRevokeTarget = {
  userId: number;
  name: string;
  ledgerBalance: number;
};

type CreditGiftRevokeDialogProps = {
  campaignId: number;
  amountPerRecipient: number;
  /** One person, or everyone who still holds the gift. */
  targets: CreditGiftRevokeTarget[];
  scope: "one" | "all";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Takes a gift back. Says up front how many balances would go negative, since
 * a negative balance blocks every credit use until it is regularized.
 */
export default function CreditGiftRevokeDialog({
  campaignId,
  amountPerRecipient,
  targets,
  scope,
  open,
  onOpenChange,
}: CreditGiftRevokeDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const negative = targets.filter(
    (target) => roundCredits(target.ledgerBalance - amountPerRecipient) < 0,
  );
  const single = scope === "one" ? targets[0] : null;

  function revoke() {
    startTransition(async () => {
      try {
        const result = await revokeCreditGiftAction({
          campaignId,
          userIds: scope === "one" ? targets.map((t) => t.userId) : undefined,
        });
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Error revoking a credit gift", error);
        toast.error("No se pudo retirar el regalo. Intentá de nuevo.");
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !isPending && onOpenChange(next)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single
              ? `¿Retirar el regalo a ${single.name}?`
              : `¿Retirar el regalo a ${targets.length} personas?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Se descuentan {formatCreditCount(amountPerRecipient)} a{" "}
            {single ? "esta persona" : "cada una"} y{" "}
            {single ? "recibe" : "reciben"} un aviso neutral en la app y por
            correo. El movimiento queda en el historial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {negative.length > 0 && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            {single
              ? `${single.name} ya usó parte de estos créditos: su saldo quedaría negativo y no podría usar créditos hasta regularizarlo.`
              : `${negative.length} ${negative.length === 1 ? "persona ya usó" : "personas ya usaron"} parte de estos créditos: su saldo quedaría negativo y no podrían usar créditos hasta regularizarlo.`}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || targets.length === 0}
            onClick={(event) => {
              event.preventDefault();
              revoke();
            }}
          >
            {isPending ? "Retirando…" : "Retirar el regalo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
