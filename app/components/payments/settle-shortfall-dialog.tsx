"use client";

import { useState } from "react";
import { ScaleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { InvoiceWithTender } from "@/app/data/invoices/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { formatMoney } from "@/app/lib/formatters";
import { featureCreditReason } from "@/app/lib/payments/feature-credits";
import { shortfallWriteOff } from "@/app/lib/payments/tender";
import { settleInvoiceShortfallAction } from "@/app/lib/reservations/payment-actions";

export default function SettleShortfallDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithTender;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isSettling, setIsSettling] = useState(false);
  const [reason, setReason] = useState("");
  // Held across retries, not minted per submit — the same rule the full-table
  // downgrade follows. settleInvoiceShortfall claims this key in the request
  // registry, so a request whose response is lost has still been recorded:
  // retrying with the same key replays that result, while a fresh key runs a
  // second write-off against an invoice the first call already brought down.
  // Only an explicit refusal, which proves the server decided, earns a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const router = useRouter();

  const { tender, featureCredits } = invoice;
  // A voucher still in review counts towards the settled amount: approving it
  // is part of this command. Shared with the menu that opens this dialog so
  // the two can never disagree about whether there is anything to write off.
  const writtenOff = shortfallWriteOff(tender);
  const settledAmount = tender.totalAmount - writtenOff;
  const extras = featureCredits.total > 0 ? featureCredits : null;

  async function handleSettle() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Indicá el motivo del saldo dado por pagado.");
      return;
    }
    setIsSettling(true);
    try {
      const result = await settleInvoiceShortfallAction({
        invoiceId: invoice.id,
        reason: trimmed,
        idempotencyKey,
      });
      if (!result.success) {
        toast.error(result.message);
        setIdempotencyKey(crypto.randomUUID());
        return;
      }

      toast.success(result.message);
      setReason("");
      setIdempotencyKey(crypto.randomUUID());
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Error al confirmar la reserva");
    } finally {
      setIsSettling(false);
    }
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (!isSettling) onOpenChange(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-700">
            <ScaleIcon className="h-5 w-5" />
          </div>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Confirmar con saldo pendiente
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            El cobro #{invoice.id} bajará de {formatMoney(tender.totalAmount)} a{" "}
            {formatMoney(settledAmount)} y la reserva quedará confirmada.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="space-y-3 px-4 md:px-0">
          {/* What actually covers the cobro, itemised. This command exists
              because credits can leave an invoice partially covered, so an
              admin deciding what to write off has to see which part of the
              coverage is credits and which is a voucher nobody has approved
              yet. */}
          <dl className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total del cobro</dt>
              <dd className="tabular-nums">
                {formatMoney(tender.totalAmount)}
              </dd>
            </div>
            {tender.confirmedCreditAmount > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Créditos aplicados</dt>
                <dd className="tabular-nums">
                  {formatMoney(tender.confirmedCreditAmount)}
                </dd>
              </div>
            )}
            {tender.approvedCashAmount > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">QR aprobado</dt>
                <dd className="tabular-nums">
                  {formatMoney(tender.approvedCashAmount)}
                </dd>
              </div>
            )}
            {tender.submittedCashAmount > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  QR en revisión (se aprobará)
                </dt>
                <dd className="tabular-nums">
                  {formatMoney(tender.submittedCashAmount)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t pt-1 font-medium">
              <dt>Se dará por pagado</dt>
              <dd className="tabular-nums">{formatMoney(writtenOff)}</dd>
            </div>
          </dl>

          <Banner variant="warning">
            Se dará por pagado {formatMoney(writtenOff)} que nadie pagó. Queda
            registrado en el historial de la reserva con este motivo.
          </Banner>

          {/* The reservation's other ledger, kept out of the arithmetic above:
              these credits settled an extra, not this cobro, so they neither
              cover it nor reduce what is being written off. */}
          {extras && (
            <p className="text-xs text-muted-foreground">
              Además, la reserva tiene {formatMoney(extras.total)} en créditos
              por extras
              {extras.types.length > 0 &&
                ` (${featureCreditReason(extras.types)})`}
              , cobrados aparte y fuera de este cobro.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="settle-shortfall-reason">Motivo</Label>
            <Textarea
              id="settle-shortfall-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explicá por qué se da por saldado el monto restante"
              disabled={isSettling}
              maxLength={1000}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 px-4 pb-6 sm:flex-row sm:justify-end md:px-0 md:pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSettling}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSettle} disabled={isSettling}>
            {isSettling ? "Confirmando..." : "Confirmar reserva"}
          </Button>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
