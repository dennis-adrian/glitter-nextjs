"use client";

import { useMemo } from "react";

import { RentalContextDescription } from "@/app/components/molecules/rental-festival-picker";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import type {
  ProductTransactionType,
  RentalEligibilityContext,
} from "@/app/lib/rentals/types";
import { rentalContextIncludesReservation } from "@/app/lib/rentals/rental-context";

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
  const showRentalContextSummary =
    transactionType === "rental" &&
    selectedContext != null &&
    !hideModeSelector;
  const hasVisibleContent =
    showModeSelector || showRentOnlyHeading || showRentalContextSummary;

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

      {showRentalContextSummary && selectedContext && (
        <p className="text-xs text-muted-foreground">
          <RentalContextDescription
            context={selectedContext}
            rentalContexts={rentalContexts}
            selectedReservationId={selectedReservationId}
            onSelectedReservationIdChange={onSelectedReservationIdChange}
          />
        </p>
      )}
    </div>
  );
}
