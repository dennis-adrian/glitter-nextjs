"use client";

import {
  ChevronDownIcon,
  CheckCheckIcon,
  CheckCircleIcon,
  TruckIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { bulkUpdateOrderStatus } from "@/app/lib/orders/actions";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import {
  BULK_ORDER_STATUS_LIMIT,
  canTransitionOrderStatus,
} from "@/app/lib/orders/status-transitions";
import { cn } from "@/lib/utils";

type BulkStatusAction = {
  status: OrderStatus;
  label: string;
  icon: typeof TruckIcon;
  /** Explains why an order may not be eligible, shown when nothing is. */
  requirement: string;
};

const BULK_STATUS_ACTIONS: BulkStatusAction[] = [
  {
    status: "processing",
    label: "Aceptar pedidos",
    icon: CheckCircleIcon,
    requirement:
      "Solo se pueden aceptar pedidos pendientes o con pago en verificación.",
  },
  {
    status: "paid",
    label: "Marcar como pagado",
    icon: CheckCheckIcon,
    requirement:
      "Solo se pueden marcar como pagados los pedidos pendientes, con pago en verificación o en proceso.",
  },
  {
    status: "delivered",
    label: "Marcar como entregado",
    icon: TruckIcon,
    requirement: "Solo se pueden entregar pedidos ya pagados.",
  },
];

/** Keeps the failure toast readable when a large selection mostly fails. */
const MAX_LISTED_FAILED_IDS = 10;

function formatOrderIds(ids: number[]): string {
  const listed = ids
    .slice(0, MAX_LISTED_FAILED_IDS)
    .map((id) => `#${id}`)
    .join(", ");
  const remaining = ids.length - MAX_LISTED_FAILED_IDS;
  return remaining > 0 ? `${listed} y ${remaining} más` : listed;
}

type OrdersBulkActionsProps = {
  orders: OrderWithRelations[];
  onDone: () => void;
  className?: string;
};

export default function OrdersBulkActions({
  orders,
  onDone,
  className,
}: OrdersBulkActionsProps) {
  const [confirming, setConfirming] = useState<BulkStatusAction | null>(null);
  const [isPending, setIsPending] = useState(false);

  if (orders.length === 0) return null;

  const eligibleFor = (status: OrderStatus) =>
    orders.filter((order) => canTransitionOrderStatus(order.status, status));

  const eligible = confirming ? eligibleFor(confirming.status) : [];
  const skipped = orders.length - eligible.length;
  const overLimit = eligible.length > BULK_ORDER_STATUS_LIMIT;
  const limitedEligible = eligible.slice(0, BULK_ORDER_STATUS_LIMIT);

  async function handleConfirm() {
    if (!confirming) return;
    setIsPending(true);
    try {
      const result = await bulkUpdateOrderStatus(
        limitedEligible.map((order) => ({
          id: order.id,
          revision: order.revision,
        })),
        confirming.status,
      );
      if (result.success) {
        if (result.failedIds.length > 0) {
          // The selection is cleared either way, so name the leftovers here or
          // there is no trace of which orders still need attention.
          toast.warning(result.message, {
            description: `No se pudieron actualizar: ${formatOrderIds(result.failedIds)}.`,
          });
        } else {
          toast.success(result.message);
        }
        setConfirming(null);
        onDone();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("No se pudieron actualizar los pedidos. Intenta de nuevo.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      {/* Full width inside the mobile action bar, compact in the desktop
          toolbar. The breakpoint matches the card/table split on the page. */}
      <div
        className={cn("flex w-full items-center gap-2 sm:w-auto", className)}
      >
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {orders.length} seleccionado{orders.length !== 1 ? "s" : ""}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              className="h-10 flex-1 sm:h-9 sm:flex-none"
            >
              Acciones
              <ChevronDownIcon className="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Acciones en lote</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {BULK_STATUS_ACTIONS.map((action) => {
              const count = eligibleFor(action.status).length;
              const Icon = action.icon;
              return (
                <DropdownMenuItem
                  key={action.status}
                  disabled={count === 0}
                  title={count === 0 ? action.requirement : undefined}
                  onSelect={() => setConfirming(action)}
                  className="py-2.5 sm:py-1.5"
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="flex-1">{action.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {count}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={onDone}
          aria-label="Limpiar selección"
          className="h-10 w-10 shrink-0 p-0 sm:h-9 sm:w-9"
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setConfirming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming?.label}</DialogTitle>
            <DialogDescription>
              Se aplicará el cambio a {eligible.length} de {orders.length}{" "}
              {orders.length === 1 ? "pedido" : "pedidos"} seleccionados.
            </DialogDescription>
          </DialogHeader>
          {skipped > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {skipped} {skipped === 1 ? "pedido" : "pedidos"} se{" "}
              {skipped === 1 ? "omitirá" : "omitirán"}.{" "}
              {confirming?.requirement}
            </p>
          )}
          {overLimit && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
              Solo puedes actualizar hasta {BULK_ORDER_STATUS_LIMIT} pedidos a
              la vez. Reduce la selección.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirming(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={isPending || eligible.length === 0 || overLimit}
              onClick={handleConfirm}
            >
              {isPending ? "Actualizando…" : "Continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
