"use client";

import Image from "next/image";
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
import { FAST_PASS_PURCHASE_STATUS_LABELS } from "@/app/lib/fast-pass/definitions";
import { reviewFastPassPurchase } from "@/app/lib/fast-pass/review-actions";
import {
  reviewDecisionRequiresReason,
  type ReviewDecision,
} from "@/app/lib/fast-pass/state";
import { formatDateWithTime } from "@/app/lib/formatters";
import { formatMoney } from "@/app/lib/programs/pricing";

type Props = {
  purchaseId: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  festivalDateLabel: string;
  totalAmount: number;
  status: "under_verification" | "changes_requested";
  submittedAt: Date | null;
  paidPassCount: number;
  childCount: number;
  vouchers: { version: number; fileUrl: string; createdAt: Date }[];
};

export default function FastPassPurchaseReviewCard({
  purchaseId,
  buyerName,
  buyerEmail,
  buyerPhone,
  festivalDateLabel,
  totalAmount,
  status,
  submittedAt,
  paidPassCount,
  childCount,
  vouchers,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<ReviewDecision | null>(null);
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
      const result = await reviewFastPassPurchase({
        purchaseId,
        decision,
        reason,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setReason("");
      router.refresh();
    } catch {
      toast.error("No pudimos registrar tu decisión");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Compra #{purchaseId}</CardTitle>
            <CardDescription>
              {buyerName} · {buyerEmail}
              {buyerPhone ? ` · ${buyerPhone}` : ""}
            </CardDescription>
          </div>
          <Badge>{FAST_PASS_PURCHASE_STATUS_LABELS[status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Día</dt>
            <dd>{festivalDateLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd>{formatMoney(totalAmount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pases pagos</dt>
            <dd>{paidPassCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Menores acompañantes</dt>
            <dd>{childCount}</dd>
          </div>
          {submittedAt ? (
            <div>
              <dt className="text-muted-foreground">Comprobante enviado</dt>
              <dd>{formatDateWithTime(submittedAt)}</dd>
            </div>
          ) : null}
        </dl>

        {current ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Comprobante actual (v{current.version})
            </p>
            <a
              href={current.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-md border"
            >
              <Image
                src={current.fileUrl}
                alt={`Comprobante v${current.version}`}
                width={800}
                height={600}
                className="h-auto w-full object-contain"
              />
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no hay comprobante cargado.
          </p>
        )}

        {previous.length > 0 ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory((value) => !value)}
            >
              {showHistory
                ? "Ocultar historial"
                : "Ver historial de comprobantes"}
            </Button>
            {showHistory ? (
              <ul className="space-y-2 text-sm">
                {previous.map((voucher) => (
                  <li key={voucher.version}>
                    <a
                      href={voucher.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      Versión {voucher.version} ·{" "}
                      {formatDateWithTime(voucher.createdAt)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`reason-${purchaseId}`}>Motivo (si aplica)</Label>
          <Textarea
            id={`reason-${purchaseId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={pending !== null} onClick={() => decide("approve")}>
            {pending === "approve" ? "Aprobando…" : "Aprobar"}
          </Button>
          <Button
            variant="secondary"
            disabled={pending !== null}
            onClick={() => decide("request_changes")}
          >
            {pending === "request_changes" ? "Enviando…" : "Solicitar cambios"}
          </Button>
          <Button
            variant="destructive"
            disabled={pending !== null}
            onClick={() => decide("reject")}
          >
            {pending === "reject" ? "Rechazando…" : "Rechazar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
