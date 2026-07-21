"use client";

import DiscountCodeInput from "@/app/components/payments/discount-code-input";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";

export default function ApplyDiscountDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithParticipants;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Aplicar descuento
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Ingresa el código que se aplicará al pago #{invoice.id}.
          </DrawerDialogDescription>
        </DrawerDialogHeader>
        <div className="px-4 pb-6 md:px-0 md:pb-0">
          <DiscountCodeInput
            invoiceId={invoice.id}
            festivalId={invoice.reservation.festivalId}
            onApplied={() => onOpenChange(false)}
          />
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
