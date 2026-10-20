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
  /** With scope "all": people the worker has not credited yet. */
  pendingCount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Takes a gift back. Says up front how many balances would go negative, since
 * a negative balance blocks every credit use until it is regularized, and,
 * while the gift is still going out, that it stops there for the rest.
 */
export default function CreditGiftRevokeDialog({
  campaignId,
  amountPerRecipient,
  targets,
  scope,
  pendingCount = 0,
  open,
  onOpenChange,
}: CreditGiftRevokeDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const negative = targets.filter(
    (target) => roundCredits(target.ledgerBalance - amountPerRecipient) < 0,
  );
  const single =
    scope === "one" || targets.length === 1 ? (targets[0] ?? null) : null;
  const cancelling = scope === "all" ? pendingCount : 0;

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
              : targets.length > 0
                ? `¿Retirar el regalo a ${targets.length} personas?`
                : cancelling > 0
                  ? "¿Dejar de enviar el regalo?"
                  : "No queda nada por retirar"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {/* The list follows the page as it refreshes, so it can empty
                while the dialog is open. */}
            {targets.length === 0 &&
              cancelling === 0 &&
              "Nadie tiene este regalo y no queda nadie por recibirlo."}
            {targets.length > 0 &&
              `Se descuentan ${formatCreditCount(amountPerRecipient)} a ${single ? "esta persona" : "cada una"} y ${single ? "recibe" : "reciben"} un aviso neutral en la app y por correo. El movimiento queda en el historial.`}
            {cancelling > 0 &&
              ` ${cancelling === 1 ? "La persona que todavía no lo recibió ya no lo va a recibir" : `Las ${cancelling} personas que todavía no lo recibieron ya no lo van a recibir`}. Si alguien lo recibe antes de que confirmes, también se le retira y se le avisa.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {negative.length > 0 && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {single
              ? `El saldo de ${single.name} quedaría negativo, y no podría usar créditos hasta regularizarlo.`
              : `${negative.length === 1 ? "1 persona quedaría" : `${negative.length} personas quedarían`} con saldo negativo, sin poder usar créditos hasta regularizarlo.`}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || (targets.length === 0 && cancelling === 0)}
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
