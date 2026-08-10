"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { formatDateWithTime } from "@/app/lib/formatters";
import { formatMoney } from "@/app/lib/programs/pricing";
import { reviewPurchase } from "@/app/lib/programs/review-actions";
import {
  cancelPurchaseAsAdmin,
  resendPurchaseLink,
} from "@/app/lib/programs/support-actions";
import {
  reviewDecisionRequiresReason,
  type ReviewDecision,
} from "@/app/lib/programs/review";

type Props = {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  isActiveParticipant: boolean;
  totalAmount: number;
  promo: {
    code: string;
    partnerName: string;
    discountPercent: number;
    discountAmount: number;
  } | null;
  status: "under_verification" | "changes_requested";
  submittedAt: Date | null;
  lines: {
    id: number;
    sessionTitle: string;
    startsAt: Date;
  }[];
  /** Newest first. Only the current one is decided on; the rest are history. */
  vouchers: { version: number; fileUrl: string; createdAt: Date }[];
};

export default function PurchaseReviewCard({
  purchaseId,
  buyerName,
  buyerEmail,
  buyerPhone,
  isActiveParticipant,
  totalAmount,
  promo,
  status,
  submittedAt,
  lines,
  vouchers,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<
    ReviewDecision | "resend" | "cancel" | null
  >(null);
  const [showHistory, setShowHistory] = useState(false);

  const current = vouchers[0];
  const previous = vouchers.slice(1);

  async function decide(decision: ReviewDecision) {
    if (reviewDecisionRequiresReason(decision) && reason.trim().length < 3) {
      toast.error("Escribe el motivo de tu decisión");
      return;
    }

    setPending(decision);
    try {
      const result = await reviewPurchase({ purchaseId, decision, reason });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setReason("");
      router.refresh();
    } catch {
      toast.error("No pudimos registrar tu decisión. Intenta de nuevo.");
    } finally {
      setPending(null);
    }
  }

  /** Support actions share `decide`'s reason requirement and refresh. */
  async function runSupport(
    kind: "resend" | "cancel",
    run: (input: { purchaseId: number; reason: string }) => Promise<{
      success: boolean;
      message: string;
    }>,
  ) {
    if (reason.trim().length < 3) {
      toast.error("Escribe el motivo");
      return;
    }

    setPending(kind);
    try {
      const result = await run({ purchaseId, reason });
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

  const resend = () => runSupport("resend", resendPurchaseLink);
  const cancel = () => runSupport("cancel", cancelPurchaseAsAdmin);

  const busy = pending !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base break-words">{buyerName}</CardTitle>
            <CardDescription className="break-all">
              {buyerEmail}
              {buyerPhone ? ` · ${buyerPhone}` : ""}
            </CardDescription>
            {/* The queue drops a purchase the moment it is decided; this is the
                way back to it, and to its history. */}
            <Link
              href={`/dashboard/programs/purchases/${purchaseId}`}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Ver inscripción #{purchaseId}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isActiveParticipant ? (
              <Badge variant="secondary">Participante activo</Badge>
            ) : null}
            {status === "changes_requested" ? (
              <Badge variant="outline">Cambios solicitados</Badge>
            ) : null}
            <Badge>{formatMoney(totalAmount)}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {promo ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-950">
            <span>
              <strong>{promo.code}</strong> · {promo.partnerName} ·{" "}
              {promo.discountPercent}%
            </span>
            <span>−{formatMoney(promo.discountAmount)}</span>
          </div>
        ) : null}
        <div className="rounded-lg border p-3 text-sm">
          {lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-3">
              <span>{line.sessionTitle}</span>
              <span className="text-muted-foreground">
                {formatDateWithTime(line.startsAt)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Comprobante v{current?.version} ·{" "}
          {submittedAt ? formatDateWithTime(submittedAt) : "sin fecha"}
        </p>

        {current ? (
          <a href={current.fileUrl} target="_blank" rel="noreferrer noopener">
            <Image
              src={current.fileUrl}
              alt={`Comprobante versión ${current.version}`}
              width={320}
              height={420}
              className="mx-auto rounded-md border"
            />
          </a>
        ) : null}

        {/* History is retained for audit but collapsed: the newest version is
            the one under review. */}
        {previous.length > 0 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowHistory((open) => !open)}
              className="text-xs underline underline-offset-2"
            >
              {showHistory
                ? "Ocultar versiones anteriores"
                : `Ver ${previous.length} versión(es) anterior(es)`}
            </button>
            {showHistory ? (
              <div className="flex flex-wrap gap-2">
                {previous.map((voucher) => (
                  <a
                    key={voucher.version}
                    href={voucher.fileUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs underline underline-offset-2"
                  >
                    v{voucher.version} · {formatDateWithTime(voucher.createdAt)}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor={`reason-${purchaseId}`}>
            Motivo (opcional al aprobar)
          </Label>
          <Textarea
            id={`reason-${purchaseId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            rows={2}
            placeholder="Queda registrado en el historial. Si pides cambios, el comprador lo verá."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide("approve")} disabled={busy}>
            {pending === "approve" ? "Aprobando..." : "Aprobar"}
          </Button>
          <Button
            variant="outline"
            onClick={() => decide("request_changes")}
            disabled={busy}
          >
            {pending === "request_changes"
              ? "Enviando..."
              : "Pedir otro comprobante"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => decide("reject")}
            disabled={busy}
          >
            {pending === "reject" ? "Rechazando..." : "Rechazar"}
          </Button>
        </div>

        {/* Support actions, separated from the review decision: these are not
            verdicts on the payment and share the same reason field. */}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant="ghost" size="sm" onClick={resend} disabled={busy}>
            {pending === "resend" ? "Enviando..." : "Reenviar enlace"}
          </Button>
          <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
            {pending === "cancel" ? "Cancelando..." : "Cancelar compra"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Reenviar genera un enlace nuevo y desactiva el anterior.
        </p>
      </CardContent>
    </Card>
  );
}
