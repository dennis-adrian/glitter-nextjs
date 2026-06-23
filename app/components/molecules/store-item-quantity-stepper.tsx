"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "@/app/lib/utils";

type StoreItemQuantityStepperProps = {
  quantity: number;
  min?: number;
  max: number;
  onDecrease: () => void;
  onIncrease: () => void;
  className?: string;
};

export default function StoreItemQuantityStepper({
  quantity,
  min = 1,
  max,
  onDecrease,
  onIncrease,
  className,
}: StoreItemQuantityStepperProps) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-stretch overflow-hidden rounded-lg border border-input bg-background",
        className,
      )}
    >
      <button
        type="button"
        className="flex w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onDecrease}
        disabled={quantity <= min}
        aria-label="Disminuir cantidad"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <div className="flex min-w-10 flex-1 items-center justify-center border-x border-input px-2 text-sm font-medium tabular-nums">
        {quantity}
      </div>
      <button
        type="button"
        className="flex w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onIncrease}
        disabled={quantity >= max}
        aria-label="Aumentar cantidad"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
