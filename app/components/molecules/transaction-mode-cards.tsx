"use client";

import type { ReactNode } from "react";

import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { RentalContextDescription } from "@/app/components/molecules/rental-festival-picker";
import type {
  ProductTransactionType,
  RentalEligibilityContext,
} from "@/app/lib/rentals/types";
import { cn } from "@/lib/utils";

type TransactionModeCardsProps = {
  transactionType: ProductTransactionType;
  onTransactionTypeChange: (value: ProductTransactionType) => void;
  purchasePrice: number;
  rentalPrice: number;
  purchasePricePrefix?: string;
  rentalContexts?: RentalEligibilityContext[];
  selectedReservationId?: number | null;
  onSelectedReservationIdChange?: (reservationId: number) => void;
  selectedRentalContext?: RentalEligibilityContext | null;
};

function formatCardPrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}

type ModeCardProps = {
  value: ProductTransactionType;
  id: string;
  label: string;
  selected: boolean;
  price: ReactNode;
  description?: ReactNode;
};

function ModeCard({
  value,
  id,
  label,
  selected,
  price,
  description,
}: ModeCardProps) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer flex-col rounded-xl border p-4 transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-foreground/20",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <RadioGroupItem
          value={value}
          id={id}
          className={cn(selected && "border-primary text-primary")}
        />
        <span
          className={cn(
            "text-sm font-semibold",
            selected ? "text-primary" : "text-foreground",
          )}
        >
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold leading-tight">{price}</div>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground font-normal">
          {description}
        </p>
      )}
    </Label>
  );
}

export default function TransactionModeCards({
  transactionType,
  onTransactionTypeChange,
  purchasePrice,
  rentalPrice,
  purchasePricePrefix = "",
  rentalContexts = [],
  selectedReservationId = null,
  onSelectedReservationIdChange,
  selectedRentalContext = null,
}: TransactionModeCardsProps) {
  const rentalDescription =
    selectedRentalContext && onSelectedReservationIdChange ? (
      <RentalContextDescription
        context={selectedRentalContext}
        rentalContexts={rentalContexts}
        selectedReservationId={selectedReservationId}
        onSelectedReservationIdChange={onSelectedReservationIdChange}
      />
    ) : (
      "Por día · Depósito reembolsable"
    );

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold">¿Comprar o alquilar?</p>
      <RadioGroup
        value={transactionType}
        onValueChange={(value) =>
          onTransactionTypeChange(value as ProductTransactionType)
        }
        className="grid grid-cols-2 gap-3"
      >
        <ModeCard
          value="purchase"
          id="transaction-mode-purchase"
          label="Comprar"
          selected={transactionType === "purchase"}
          price={
            <>
              <span className="text-xs font-normal text-muted-foreground">
                {purchasePricePrefix}
              </span>
              Bs{formatCardPrice(purchasePrice)}
            </>
          }
        />
        <ModeCard
          value="rental"
          id="transaction-mode-rental"
          label="Alquilar"
          selected={transactionType === "rental"}
          price={
            <span className="flex items-baseline gap-0.5">
              Bs{formatCardPrice(rentalPrice)}
            </span>
          }
          description={rentalDescription}
        />
      </RadioGroup>
    </div>
  );
}
