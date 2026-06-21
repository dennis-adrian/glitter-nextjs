"use client";

import { useMemo } from "react";

import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import type {
  ProductTransactionType,
  RentalEligibilityContext,
} from "@/app/lib/rentals/types";

type RentalTransactionControlsProps = {
  canPurchase: boolean;
  canRent: boolean;
  transactionType: ProductTransactionType;
  onTransactionTypeChange: (value: ProductTransactionType) => void;
  rentalContexts: RentalEligibilityContext[];
  selectedReservationId: number | null;
  onSelectedReservationIdChange: (reservationId: number) => void;
};

export default function RentalTransactionControls({
  canPurchase,
  canRent,
  transactionType,
  onTransactionTypeChange,
  rentalContexts,
  selectedReservationId,
  onSelectedReservationIdChange,
}: RentalTransactionControlsProps) {
  const showModeSelector = canPurchase && canRent;
  const selectedContext = useMemo(
    () =>
      rentalContexts.find(
        (context) => context.reservationId === selectedReservationId,
      ) ?? rentalContexts[0] ??
      null,
    [rentalContexts, selectedReservationId],
  );

  if (!canRent) {
    return null;
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      {showModeSelector ? (
        <div className="grid gap-2">
          <Label>Modo</Label>
          <RadioGroup
            value={transactionType}
            onValueChange={(value) =>
              onTransactionTypeChange(value as ProductTransactionType)
            }
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="purchase" id="mode-purchase" />
              <Label htmlFor="mode-purchase">Comprar</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="rental" id="mode-rental" />
              <Label htmlFor="mode-rental">Alquilar</Label>
            </div>
          </RadioGroup>
        </div>
      ) : (
        <p className="text-sm font-medium">Alquiler</p>
      )}

      {transactionType === "rental" && rentalContexts.length > 1 && (
        <div className="grid gap-2">
          <Label>Festival / stand</Label>
          <Select
            value={
              selectedContext
                ? String(selectedContext.reservationId)
                : undefined
            }
            onValueChange={(value) =>
              onSelectedReservationIdChange(Number(value))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona tu reserva" />
            </SelectTrigger>
            <SelectContent>
              {rentalContexts.map((context) => (
                <SelectItem
                  key={context.reservationId}
                  value={String(context.reservationId)}
                >
                  {context.festivalName} · Stand {context.standNumber}
                  {context.standLabel ? ` (${context.standLabel})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {transactionType === "rental" && selectedContext && (
        <p className="text-xs text-muted-foreground">
          Alquiler para {selectedContext.festivalName}, stand{" "}
          {selectedContext.standNumber}
          {selectedContext.standLabel ? ` (${selectedContext.standLabel})` : ""}
        </p>
      )}
    </div>
  );
}
