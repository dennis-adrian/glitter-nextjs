"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import CreditAmount, {
  formatCredits,
} from "@/app/components/credits/credit-amount";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Textarea } from "@/app/components/ui/textarea";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { reviewCreditTopUpAction } from "@/app/lib/credits/actions";

type CreditTopUpReviewDialogProps = {
  topUpId: number;
  amount: number;
  participantName: string;
  voucherUrl: string | null;
  ledgerBalance: number;
  balanceAfterReversal: number;
  spentSinceSubmission: number;
  /** Only a global admin may decide; a festival admin sees the same evidence. */
  canReview: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function CreditTopUpReviewDialog({
  topUpId,
  amount,
  participantName,
  voucherUrl,
  ledgerBalance,
  balanceAfterReversal,
  spentSinceSubmission,
  canReview,
  open,
  onOpenChange,
}: CreditTopUpReviewDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectReason, setShowRejectReason] = useState(false);
  // Tracking which url failed, rather than a boolean, resets itself when the
  // dialog is reused for another voucher. A voucher whose file has gone
  // missing must read as missing evidence, not as a broken thumbnail an admin
  // might approve past.
  const [brokenVoucherUrl, setBrokenVoucherUrl] = useState<string | null>(null);
  const voucherBroken = voucherUrl != null && brokenVoucherUrl === voucherUrl;

  function review(decision: "approved" | "rejected") {
    startTransition(async () => {
      try {
        const result = await reviewCreditTopUpAction({
          topUpId,
          decision,
          rejectionReason:
            decision === "rejected" ? rejectionReason.trim() : undefined,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setRejectionReason("");
        setShowRejectReason(false);
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Error reviewing credit top-up", error);
        toast.error("No se pudo revisar la carga. Intentá nuevamente.");
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
          setRejectionReason("");
          setShowRejectReason(false);
        }
        onOpenChange(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Revisar carga de créditos
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            {formatCredits(amount)} · {participantName}
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-6 md:px-0 md:pb-0">
          {voucherUrl && !voucherBroken ? (
            <Image
              className="mx-auto rounded-md border"
              src={voucherUrl}
              alt={`Comprobante de ${participantName}`}
              width={300}
              height={400}
              onError={() => setBrokenVoucherUrl(voucherUrl)}
            />
          ) : (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>
                {voucherUrl
                  ? "No se pudo cargar el comprobante. El archivo puede haberse borrado. No apruebes esta carga sin revisar el caso."
                  : "Esta carga no tiene comprobante registrado. No la apruebes sin revisar el caso."}
              </AlertDescription>
            </Alert>
          )}

          <dl className="space-y-2 rounded-md bg-muted p-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Saldo actual</dt>
              <dd>
                <CreditAmount amount={ledgerBalance} />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Gastado desde el envío</dt>
              <dd>
                <CreditAmount amount={spentSinceSubmission} />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Saldo si se rechaza</dt>
              <dd
                className={
                  balanceAfterReversal < 0 ? "font-medium text-red-600" : ""
                }
              >
                <CreditAmount amount={balanceAfterReversal} />
              </dd>
            </div>
          </dl>

          {balanceAfterReversal < 0 && (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>
                Ya se usaron estos créditos. Rechazar deja una deuda de{" "}
                {formatCredits(Math.abs(balanceAfterReversal))} y no deshace las
                acciones ya completadas: vas a tener que resolverla aparte.
              </AlertDescription>
            </Alert>
          )}

          {!canReview && (
            <p className="text-sm text-muted-foreground">
              Solo un administrador general puede aprobar o rechazar una carga
              de créditos.
            </p>
          )}

          {showRejectReason && (
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor={`rejection-reason-${topUpId}`}
              >
                Motivo del rechazo
              </label>
              <Textarea
                id={`rejection-reason-${topUpId}`}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Ej: el comprobante no coincide con el monto."
                maxLength={1000}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                El participante ve este motivo en su billetera.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => review("approved")}
              disabled={!canReview || isPending || showRejectReason}
            >
              {isPending && !showRejectReason ? (
                <span className="flex items-center gap-2">
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Aprobando...
                </span>
              ) : (
                "Aprobar créditos"
              )}
            </Button>

            {showRejectReason ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowRejectReason(false);
                    setRejectionReason("");
                  }}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => review("rejected")}
                  disabled={isPending || !rejectionReason.trim()}
                >
                  {isPending ? "Rechazando..." : "Confirmar rechazo"}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowRejectReason(true)}
                disabled={!canReview || isPending}
              >
                Rechazar
              </Button>
            )}
          </div>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
