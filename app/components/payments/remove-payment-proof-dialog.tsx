"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
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
import { adminRemovePaymentVoucher } from "@/app/data/invoices/actions";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";

export default function RemovePaymentProofDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithParticipants;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isRemoving, setIsRemoving] = useState(false);
  const router = useRouter();

  async function handleRemove() {
    setIsRemoving(true);
    try {
      const result = await adminRemovePaymentVoucher(invoice.id);
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      onOpenChange(false);
      router.refresh();
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        if (!isRemoving) onOpenChange(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Trash2Icon className="h-5 w-5" />
          </div>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Eliminar comprobante
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Se eliminará el comprobante del pago #{invoice.id} y el pago volverá
            a figurar como pendiente.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="flex flex-col-reverse gap-2 px-4 pb-6 sm:flex-row sm:justify-end md:px-0 md:pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRemoving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleRemove}
            disabled={isRemoving}
          >
            {isRemoving ? "Eliminando..." : "Eliminar comprobante"}
          </Button>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
