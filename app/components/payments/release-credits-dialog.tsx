"use client";

import { useState } from "react";
import { CoinsIcon } from "lucide-react";
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
import { InvoiceWithTender } from "@/app/data/invoices/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { releaseInvoiceCreditsAction } from "@/app/lib/reservations/payment-actions";

export default function ReleaseCreditsDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithTender;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isReleasing, setIsReleasing] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();

  const creditAmount = invoice.tender.confirmedCreditAmount;
  const nextOutstanding = invoice.tender.outstandingAmount + creditAmount;

  async function handleRelease() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Indicá el motivo de la devolución.");
      return;
    }
    setIsReleasing(true);
    try {
      const result = await releaseInvoiceCreditsAction({
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
      toast.error("Error al devolver los créditos");
    } finally {
      setIsReleasing(false);
    }
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (!isReleasing) onOpenChange(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-700">
            <CoinsIcon className="h-5 w-5" />
          </div>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Devolver créditos aplicados
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Se devolverán Bs{creditAmount} a la cuenta de{" "}
            {invoice.user.displayName || "la persona titular"}. El saldo del
            cobro #{invoice.id} pasará a Bs{nextOutstanding}. Queda registrado
            en el libro de créditos y en el historial de la reserva.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="space-y-2 px-4 md:px-0">
          <Label htmlFor="release-credits-reason">Motivo</Label>
          <Textarea
            id="release-credits-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explicá por qué se devuelven los créditos"
            disabled={isReleasing}
            maxLength={1000}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 px-4 pb-6 sm:flex-row sm:justify-end md:px-0 md:pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isReleasing}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleRelease} disabled={isReleasing}>
            {isReleasing ? "Devolviendo..." : `Devolver Bs${creditAmount}`}
          </Button>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
