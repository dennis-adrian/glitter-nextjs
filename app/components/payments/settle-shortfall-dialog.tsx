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
  const router = useRouter();

  const { tender } = invoice;
  // A voucher still in review counts towards the settled amount: approving it
  // is part of this command.
  const settledAmount = tender.coveredAmount + tender.submittedCashAmount;
  const writtenOff = Math.max(0, tender.totalAmount - settledAmount);

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
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setReason("");
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
            El cobro #{invoice.id} bajará de Bs{tender.totalAmount} a Bs
            {settledAmount} y la reserva quedará confirmada.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="space-y-3 px-4 md:px-0">
          <Banner variant="warning">
            Se dará por pagado Bs{writtenOff} que nadie tendió. Queda registrado
            en el historial de la reserva con este motivo.
          </Banner>

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
