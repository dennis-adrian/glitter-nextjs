"use client";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  CREDIT_GIFT_AMOUNT_PRESETS,
  CREDIT_GIFT_MAX_AMOUNT_PER_RECIPIENT,
} from "@/app/lib/credit_gifts/definitions";
import { cn } from "@/lib/utils";

type CreditGiftAmountFieldProps = {
  /** The amount as typed, so a half-typed "2." is not rewritten under the cursor. */
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
};

export default function CreditGiftAmountField({
  value,
  onChange,
  invalid,
  disabled = false,
}: CreditGiftAmountFieldProps) {
  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Montos sugeridos"
      >
        {CREDIT_GIFT_AMOUNT_PRESETS.map((preset) => {
          const active = Number(value) === preset;
          return (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(String(preset))}
            >
              {preset}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="credit-gift-amount" className="sr-only">
          Créditos por persona
        </label>
        <Input
          id="credit-gift-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max={CREDIT_GIFT_MAX_AMOUNT_PER_RECIPIENT}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Otro monto"
          disabled={disabled}
          aria-invalid={invalid}
          className={cn("max-w-40", invalid && "border-red-500")}
        />
        <span className="text-sm text-muted-foreground">créditos</span>
      </div>
      {invalid ? (
        <p className="text-xs text-red-600">
          Ingresá un monto mayor a 0 y de hasta{" "}
          {CREDIT_GIFT_MAX_AMOUNT_PER_RECIPIENT} créditos, con dos decimales
          como máximo.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Un crédito equivale a Bs 1. Máximo{" "}
          {CREDIT_GIFT_MAX_AMOUNT_PER_RECIPIENT} por persona.
        </p>
      )}
    </div>
  );
}
