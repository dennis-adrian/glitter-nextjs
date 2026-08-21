"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import {
  adminReturnOrder,
  type AdminReturnOrderInput,
} from "@/app/lib/orders/actions";
import type { OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderItemDisplayName } from "@/app/lib/orders/utils";

export default function AdminReturnOrderForm({
  order,
}: {
  order: OrderWithRelations;
}) {
  const router = useRouter();
  const returnableItems = order.orderItems;
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const refund = returnableItems.reduce(
    (sum, item) => sum + (quantities[item.id] ?? 0) * item.priceAtPurchase,
    0,
  );
  const selected = Object.entries(quantities).filter(
    ([, quantity]) => quantity > 0,
  );

  async function submit() {
    if (!reason.trim() || selected.length === 0) {
      toast.error("Seleccioná productos y escribí el motivo de la devolución.");
      return;
    }
    setPending(true);
    const payload: AdminReturnOrderInput = {
      orderId: order.id,
      expectedRevision: order.revision,
      reason,
      items: selected.map(([orderItemId, quantity]) => ({
        orderItemId: Number(orderItemId),
        quantity,
      })),
    };
    try {
      const result = await adminReturnOrder(payload);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.push(`/dashboard/store/orders/${order.id}`);
    } catch {
      toast.error("No se pudo registrar la devolución.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Productos a devolver</CardTitle>
        <p className="text-sm text-muted-foreground">
          La orden original no se modifica. Se registra una devolución, se
          restaura el stock y el importe se descuenta del reporte de
          rentabilidad.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {returnableItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {getOrderItemDisplayName(item)}
              </p>
              <p className="text-sm text-muted-foreground">
                Bs {item.priceAtPurchase.toFixed(2)} c/u · máximo{" "}
                {item.quantity}
              </p>
            </div>
            <Input
              className="w-24 text-center"
              type="number"
              min={0}
              max={item.quantity}
              value={quantities[item.id] ?? 0}
              onChange={(event) =>
                setQuantities((current) => ({
                  ...current,
                  [item.id]: Math.max(
                    0,
                    Math.min(item.quantity, Number(event.target.value) || 0),
                  ),
                }))
              }
              aria-label={`Cantidad a devolver de ${getOrderItemDisplayName(item)}`}
            />
          </div>
        ))}

        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between font-medium">
            <span>Reembolso estimado</span>
            <span>Bs {refund.toFixed(2)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            El pago real debe procesarse por el método de pago correspondiente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="return-reason">Motivo</Label>
          <Textarea
            id="return-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej. producto defectuoso, cambio de talla..."
            maxLength={500}
          />
        </div>
        <Button onClick={submit} disabled={pending || selected.length === 0}>
          {pending ? "Registrando..." : "Registrar devolución"}
        </Button>
      </CardContent>
    </Card>
  );
}
