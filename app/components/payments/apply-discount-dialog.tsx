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
import { formatMoney } from "@/app/lib/formatters";
import { roundMoney } from "@/app/lib/reservations/money";

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
  const amount = roundMoney(Number(invoice.amount));

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Aplicar descuento
          </DrawerDialogTitle>
          {/* "cobro", not "pago": the object is the bill, and "pago" is
              reserved for what the participant sends against it. The current
              monto is named because a discount changes it, and an admin
              applying a code had no figure on screen to apply it to. */}
          <DrawerDialogDescription isDesktop={isDesktop}>
            Ingresa el código que se aplicará al cobro #{invoice.id}, hoy de{" "}
            {formatMoney(amount)}.
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
