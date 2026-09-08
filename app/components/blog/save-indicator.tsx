"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";

import { cn } from "@/app/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  status: SaveStatus;
  errorMessage?: string;
};

export default function SaveIndicator({ status, errorMessage }: Props) {
  const isGreen = status === "saved" || status === "idle";
  let label = "Guardado";
  if (status === "saving") label = "Guardando...";
  if (status === "error") label = "Error al guardar";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs",
        isGreen && "border-primary-700 text-primary-700",
        status === "saving" && "text-muted-foreground",
        status === "error" && "border-red-200 text-red-700",
      )}
      title={status === "error" ? errorMessage : undefined}
    >
      {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {isGreen && <Check className="h-3 w-3" />}
      {status === "error" && <AlertCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}
