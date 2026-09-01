"use client";

import { useState } from "react";
import { FilePenLineIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { correctSettlementProofAction } from "@/app/lib/reservations/payment-actions";

export default function CorrectPaymentProofDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithParticipants;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();

  async function handleCorrect() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Indicá el motivo de la corrección.");
      return;
    }
    setIsCorrecting(true);
    try {
      const result = await correctSettlementProofAction({
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
      toast.error("Error al corregir el comprobante");
    } finally {
      setIsCorrecting(false);
    }
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (!isCorrecting) onOpenChange(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <FilePenLineIcon className="h-5 w-5" />
          </div>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Corregir comprobante
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Se rechazará el comprobante del pago #{invoice.id}. La reserva y la
            factura volverán a pendiente. El registro de pago se conserva.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="space-y-2 px-4 md:px-0">
          <Label htmlFor="settlement-correction-reason">Motivo</Label>
          <Textarea
            id="settlement-correction-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explicá por qué se corrige el comprobante"
            disabled={isCorrecting}
            maxLength={1000}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 px-4 pb-6 sm:flex-row sm:justify-end md:px-0 md:pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCorrecting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleCorrect}
            disabled={isCorrecting}
          >
            {isCorrecting ? "Corrigiendo..." : "Corregir comprobante"}
          </Button>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
