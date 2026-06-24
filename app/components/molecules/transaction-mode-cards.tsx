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
  rentalDisabled?: boolean;
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
  disabled?: boolean;
};

function ModeCard({
  value,
  id,
  label,
  selected,
  price,
  description,
  disabled = false,
}: ModeCardProps) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex flex-col rounded-xl border p-4 transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/30 opacity-60"
          : selected
            ? "cursor-pointer border-primary bg-primary/5"
            : "cursor-pointer border-border bg-card hover:border-foreground/20",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <RadioGroupItem
          value={value}
          id={id}
          disabled={disabled}
          className={cn(selected && !disabled && "border-primary text-primary")}
        />
        <span
          className={cn(
            "text-sm font-semibold",
            disabled
              ? "text-muted-foreground"
              : selected
                ? "text-primary"
                : "text-foreground",
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
  rentalDisabled = false,
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
          selected={!rentalDisabled && transactionType === "rental"}
          disabled={rentalDisabled}
          price={
            <span className="flex items-baseline gap-0.5">
              Bs{formatCardPrice(rentalPrice)}
            </span>
          }
          description={rentalDisabled ? undefined : rentalDescription}
        />
      </RadioGroup>
    </div>
  );
}
