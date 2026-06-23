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
import {
  formatRentalContextSummary,
  formatRentalContextStands,
  rentalContextIncludesReservation,
} from "@/app/lib/rentals/rental-context";

type RentalTransactionControlsProps = {
  canPurchase: boolean;
  canRent: boolean;
  transactionType: ProductTransactionType;
  onTransactionTypeChange: (value: ProductTransactionType) => void;
  rentalContexts: RentalEligibilityContext[];
  selectedReservationId: number | null;
  onSelectedReservationIdChange: (reservationId: number) => void;
  hideModeSelector?: boolean;
};

export default function RentalTransactionControls({
  canPurchase,
  canRent,
  transactionType,
  onTransactionTypeChange,
  rentalContexts,
  selectedReservationId,
  onSelectedReservationIdChange,
  hideModeSelector = false,
}: RentalTransactionControlsProps) {
  const showModeSelector = canPurchase && canRent && !hideModeSelector;
  const selectedContext = useMemo(
    () =>
      rentalContexts.find((context) =>
        rentalContextIncludesReservation(context, selectedReservationId),
      ) ??
      rentalContexts[0] ??
      null,
    [rentalContexts, selectedReservationId],
  );
  const showRentOnlyHeading = !canPurchase && !hideModeSelector;
  const showFestivalPicker =
    transactionType === "rental" && rentalContexts.length > 1;
  const showRentalContextSummary =
    transactionType === "rental" &&
    selectedContext != null &&
    !hideModeSelector;
  const hasVisibleContent =
    showModeSelector ||
    showRentOnlyHeading ||
    showFestivalPicker ||
    showRentalContextSummary;

  if (!canRent || !hasVisibleContent) {
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
              <RadioGroupItem value="rental" id="mode-rental" />
              <Label htmlFor="mode-rental">Alquilar</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="purchase" id="mode-purchase" />
              <Label htmlFor="mode-purchase">Comprar</Label>
            </div>
          </RadioGroup>
        </div>
      ) : showRentOnlyHeading ? (
        <p className="text-sm font-medium">Alquiler</p>
      ) : null}

      {showFestivalPicker && (
        <div className="grid gap-2">
          <Label>Festival</Label>
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
                  {context.festivalName} - {formatRentalContextStands(context)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showRentalContextSummary && selectedContext && (
        <p className="text-xs text-muted-foreground">
          {formatRentalContextSummary(selectedContext)}
        </p>
      )}
    </div>
  );
}
