"use client";

import { ShoppingCartIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import type { ProductTransactionType } from "@/app/lib/rentals/types";

function formatStorePrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}

function SubmitButtonLabel({
  isPresale,
  transactionType,
  unitPrice,
  subtotal,
}: {
  isPresale: boolean;
  transactionType: ProductTransactionType;
  unitPrice: number;
  subtotal: number;
}) {
  const buttonLabel = isPresale ? "Reservar" : "Agregar al carrito";
  const priceLabel = `Bs${formatStorePrice(subtotal)}`;

  return (
    <span className="flex items-center gap-1 leading-tight">
      <span>{buttonLabel} ·</span>
      <span>{priceLabel}</span>
    </span>
  );
}

export default function SubmitProductOrderButton({
  className,
  inStock,
  isPresale,
  disabled,
  loading,
  onClick,
  transactionType = "purchase",
  unitPrice = 0,
  subtotal = 0,
}: {
  className?: string;
  inStock: boolean;
  isPresale: boolean;
  disabled: boolean;
  loading: boolean;
  onClick?: () => void;
  transactionType?: ProductTransactionType;
  unitPrice?: number;
  subtotal?: number;
}) {
  if (!inStock) {
    return (
      <Button
        className="h-12 w-full bg-muted text-muted-foreground hover:bg-muted hover:translate-y-0"
        disabled
        type="button"
      >
        Agotado
      </Button>
    );
  }

  return (
    <Button
      type="button"
      className={cn(
        "h-12 gap-2 px-4 text-sm font-medium",
        isPresale
          ? "bg-amber-600 hover:bg-amber-700"
          : "bg-primary hover:bg-primary/90",
        className,
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      <ShoppingCartIcon className="h-5 w-5 shrink-0 hidden sm:block" />
      {loading ? (
        <span>Agregando...</span>
      ) : (
        <SubmitButtonLabel
          isPresale={isPresale}
          transactionType={transactionType}
          unitPrice={unitPrice}
          subtotal={subtotal}
        />
      )}
    </Button>
  );
}
