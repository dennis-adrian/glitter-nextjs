"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { adminAdjustOrder } from "@/app/lib/orders/actions";
import type { OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderItemDisplayName } from "@/app/lib/orders/utils";

export default function AdminAdjustOrderForm({
  order,
}: {
  order: OrderWithRelations;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(
      order.orderItems.map((item) => [item.id, item.quantity]),
    ),
  );
  const [reason, setReason] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [pending, setPending] = useState(false);
  const total = order.orderItems.reduce(
    (sum, item) =>
      sum + item.priceAtPurchase * (quantities[item.id] ?? item.quantity),
    0,
  );

  async function submit() {
    setPending(true);
    const result = await adminAdjustOrder(
      order.id,
      order.orderItems.map((item) => ({
        orderItemId: item.id,
        quantity: quantities[item.id] ?? item.quantity,
      })),
      order.revision,
      reason,
      customerNote,
    );
    setPending(false);
    if (!result.success) return toast.error(result.message);
    toast.success(result.message);
    router.push(`/dashboard/store/orders/${order.id}`);
  }

  return (
    <div className="space-y-5">
      {order.orderItems.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-4 rounded-lg border p-3"
        >
          <div>
            <p className="font-medium">{getOrderItemDisplayName(item)}</p>
            <p className="text-sm text-muted-foreground">
              Bs {item.priceAtPurchase.toFixed(2)} c/u
            </p>
          </div>
          <Input
            className="w-24 text-base"
            min={0}
            type="number"
            value={quantities[item.id] ?? item.quantity}
            onChange={(event) =>
              setQuantities((current) => ({
                ...current,
                [item.id]: Math.max(0, Number(event.target.value) || 0),
              }))
            }
          />
        </div>
      ))}
      <p className="text-lg font-semibold">
        Nuevo total: Bs {total.toFixed(2)}
      </p>
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo interno del ajuste"
        required
      />
      <Textarea
        value={customerNote}
        onChange={(event) => setCustomerNote(event.target.value)}
        placeholder="Nota visible para cliente (opcional)"
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button onClick={submit} disabled={pending || !reason.trim()}>
          Aplicar ajuste
        </Button>
      </div>
    </div>
  );
}
