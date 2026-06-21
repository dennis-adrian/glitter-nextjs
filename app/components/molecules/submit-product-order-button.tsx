"use client";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

export default function SubmitProductOrderButton({
  className,
  inStock,
  isPresale,
  disabled,
  loading,
  onClick,
}: {
  className?: string;
  inStock: boolean;
  isPresale: boolean;
  disabled: boolean;
  loading: boolean;
  onClick?: () => void;
}) {
  if (!inStock) {
    return (
      <Button
        className="bg-muted text-muted-foreground hover:bg-muted hover:translate-y-0"
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
        "w-full",
        isPresale
          ? "bg-amber-600 hover:bg-amber-700"
          : "bg-purple-600 hover:bg-purple-700",
        className,
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? "Agregando..." : "Agregar al carrito"}
    </Button>
  );
}
