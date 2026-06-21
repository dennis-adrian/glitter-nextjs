"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { markRentalOrderItemReturned } from "@/app/lib/rentals/return-actions";
import { getRentalOutstandingQuantity } from "@/app/lib/rentals/status";
import type { RentalReturnCondition } from "@/app/lib/rentals/types";

type RentalReturnFormProps = {
  orderItemId: number;
  quantity: number;
  rentalReturnedQuantity: number;
};

export default function RentalReturnForm({
  orderItemId,
  quantity,
  rentalReturnedQuantity,
}: RentalReturnFormProps) {
  const outstanding = getRentalOutstandingQuantity({
    quantity,
    rentalReturnedQuantity,
  });
  const [quantityReturned, setQuantityReturned] = useState(outstanding);
  const [conditionStatus, setConditionStatus] =
    useState<RentalReturnCondition>("good");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (outstanding <= 0) {
    return null;
  }

  return (
    <form
      className="grid gap-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await markRentalOrderItemReturned(orderItemId, {
            quantityReturned,
            conditionStatus,
            notes,
          });

          if (!result.success) {
            toast.error(result.message);
            return;
          }

          toast.success(
            `Devolución registrada. Pendiente: ${result.outstandingQuantity}`,
          );
          router.refresh();
        });
      }}
    >
      <p className="text-sm font-medium">Registrar devolución</p>
      <div className="grid gap-2">
        <Label htmlFor={`return-qty-${orderItemId}`}>Cantidad devuelta</Label>
        <Input
          id={`return-qty-${orderItemId}`}
          type="number"
          min={1}
          max={outstanding}
          value={quantityReturned}
          onChange={(event) =>
            setQuantityReturned(Number(event.target.value) || 1)
          }
        />
      </div>
      <div className="grid gap-2">
        <Label>Condición</Label>
        <Select
          value={conditionStatus}
          onValueChange={(value) =>
            setConditionStatus(value as RentalReturnCondition)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="good">Buena</SelectItem>
            <SelectItem value="damaged">Dañado</SelectItem>
            <SelectItem value="missing_parts">Piezas faltantes</SelectItem>
            <SelectItem value="lost">Perdido</SelectItem>
            <SelectItem value="other">Otro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`return-notes-${orderItemId}`}>Notas</Label>
        <Textarea
          id={`return-notes-${orderItemId}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={
            conditionStatus === "good"
              ? "Opcional"
              : "Describe el estado del producto"
          }
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Procesando..." : "Registrar devolución"}
      </Button>
    </form>
  );
}
