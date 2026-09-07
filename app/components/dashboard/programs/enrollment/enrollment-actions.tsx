"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";
import {
  REVIEW_BLOCKER_LABELS,
  reviewDecisionRequiresReason,
  resolveReviewDecision,
  type ReviewDecision,
} from "@/app/lib/programs/review";
import { reviewPurchase } from "@/app/lib/programs/review-actions";
import {
  SUPPORT_BLOCKER_LABELS,
  canCancelAsAdmin,
  canResend,
} from "@/app/lib/programs/support";
import {
  cancelPurchaseAsAdmin,
  resendPurchaseLink,
} from "@/app/lib/programs/support-actions";

type Props = {
  purchaseId: number;
  status: SessionPurchaseStatus;
  paymentMode: "bank_qr" | "free";
  voucherCount: number;
  hasRecipient: boolean;
};

/**
 * Every admin mutation this enrollment allows, gated by the same pure rules the
 * server actions enforce.
 *
 * The gating is what makes this page work where the review queue could not: an
 * approved seat offers cancel and resend but no verdict, a free registration
 * offers no verdict at all, and a closed purchase offers nothing — each with
 * the reason spelled out rather than a button that fails on click.
 */
export default function EnrollmentActions({
  purchaseId,
  status,
  paymentMode,
  voucherCount,
  hasRecipient,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<
    ReviewDecision | "resend" | "cancel" | null
  >(null);

  // `approve` stands in for the group: today no decision is gated differently
  // from another, and `resolveReviewDecision` documents that explicitly.
  const review = resolveReviewDecision(
    { paymentMode, status, voucherCount },
    "approve",
  );
  const cancellation = canCancelAsAdmin({ status });
  const resending = canResend(hasRecipient);
  const busy = pending !== null;

  async function run(
    kind: ReviewDecision | "resend" | "cancel",
    execute: () => Promise<{ success: boolean; message: string }>,
    requiresReason: boolean,
  ) {
    if (requiresReason && reason.trim().length < 3) {
      toast.error("Escribe el motivo");
      return;
    }

    setPending(kind);
    try {
      const result = await execute();
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setReason("");
      router.refresh();
    } catch {
      toast.error("No pudimos completar la acción. Intenta de nuevo.");
    } finally {
      setPending(null);
    }
  }

  const decide = (decision: ReviewDecision) =>
    run(
      decision,
      () => reviewPurchase({ purchaseId, decision, reason }),
      reviewDecisionRequiresReason(decision),
    );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="enrollment-reason">Motivo</Label>
        <Textarea
          id="enrollment-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Queda registrado en el historial. Si pides cambios, el comprador lo verá."
        />
        <p className="text-xs text-muted-foreground">
          Obligatorio en todo salvo aprobar.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Decisión de pago
        </p>
        {review.allowed ? (
          // Full-width stacked on a phone so each target is thumb-sized, inline
          // once there is room for them to sit together.
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              className="w-full sm:w-auto"
              onClick={() => decide("approve")}
              disabled={busy}
            >
              {pending === "approve" ? "Aprobando…" : "Aprobar"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => decide("request_changes")}
              disabled={busy}
            >
              {pending === "request_changes"
                ? "Enviando…"
                : "Pedir otro comprobante"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="destructive"
              onClick={() => decide("reject")}
              disabled={busy}
            >
              {pending === "reject" ? "Rechazando…" : "Rechazar"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {REVIEW_BLOCKER_LABELS[review.blocker]}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Soporte
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {resending.allowed ? (
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() =>
                run(
                  "resend",
                  () => resendPurchaseLink({ purchaseId, reason }),
                  true,
                )
              }
              disabled={busy}
            >
              {pending === "resend" ? "Enviando…" : "Reenviar enlace"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              {SUPPORT_BLOCKER_LABELS[resending.blocker]}
            </p>
          )}

          {cancellation.allowed ? (
            <Button
              className="w-full sm:w-auto"
              variant="destructive"
              onClick={() =>
                run(
                  "cancel",
                  () => cancelPurchaseAsAdmin({ purchaseId, reason }),
                  true,
                )
              }
              disabled={busy}
            >
              {pending === "cancel" ? "Cancelando…" : "Cancelar inscripción"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              {SUPPORT_BLOCKER_LABELS[cancellation.blocker]}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Reenviar genera un enlace nuevo y desactiva el anterior. Cancelar
          anula las entradas emitidas y libera el cupo.
        </p>
      </div>
    </div>
  );
}
