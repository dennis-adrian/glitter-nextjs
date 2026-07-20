"use client";

import { InvoiceStatus } from "@/app/data/invoices/definitions";
import { Badge } from "@/app/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { updateInvoiceStatus } from "@/app/data/invoices/actions";
import { cn } from "@/app/lib/utils";
import { CheckIcon, CircleXIcon, MinusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const statusColors: Record<InvoiceStatus, string> = {
  pending:
    "bg-gray-500/20 border border-gray-300 text-gray-800 hover:bg-gray-500/30 hover:border-gray-300",
  paid: "bg-green-500/20 border border-green-300 text-green-800 hover:bg-green-500/30 hover:border-green-300",
  cancelled:
    "bg-red-500/20 border border-red-300 text-red-800 hover:bg-red-500/30 hover:border-red-300",
};

const statusLabels: Record<InvoiceStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  cancelled: "Cancelado",
};

const statusIcons: Record<InvoiceStatus, typeof MinusIcon> = {
  pending: MinusIcon,
  paid: CheckIcon,
  cancelled: CircleXIcon,
};

const statuses: InvoiceStatus[] = ["pending", "paid", "cancelled"];

export default function PaymentStatus({
  invoiceId,
  status,
  isAdmin = false,
}: {
  invoiceId: number;
  status: InvoiceStatus;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const StatusIcon = statusIcons[status];

  function handleStatusChange(nextStatus: InvoiceStatus) {
    if (nextStatus === status || isPending) return;

    startTransition(async () => {
      const result = await updateInvoiceStatus(invoiceId, nextStatus);
      if (result.success) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  if (!isAdmin) {
    return (
      <Badge className={`${statusColors[status]} font-normal`}>
        {statusLabels[status]}
      </Badge>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          aria-label={`Cambiar estado del pago: ${statusLabels[status]}`}
          className={cn(
            "inline-flex min-w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60",
            statusColors[status],
          )}
        >
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {statusLabels[status]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
          Estado del pago
        </p>
        <div className="space-y-0.5">
          {statuses.map((nextStatus) => {
            const OptionIcon = statusIcons[nextStatus];
            const isSelected = nextStatus === status;

            return (
              <button
                key={nextStatus}
                type="button"
                disabled={isPending}
                onClick={() => handleStatusChange(nextStatus)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus:outline-hidden focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60",
                  isSelected && "bg-accent text-accent-foreground",
                )}
              >
                <OptionIcon
                  className={cn(
                    "h-4 w-4",
                    nextStatus === "pending" && "text-gray-500",
                    nextStatus === "paid" && "text-green-600",
                    nextStatus === "cancelled" && "text-red-600",
                  )}
                  aria-hidden="true"
                />
                <span className="flex-1">{statusLabels[nextStatus]}</span>
                {isSelected && <CheckIcon className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
