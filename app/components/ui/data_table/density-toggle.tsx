"use client";

import { Rows2Icon, Rows4Icon, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type TableDensity = "comfortable" | "compact";

const OPTIONS: { value: TableDensity; label: string; icon: LucideIcon }[] = [
  { value: "comfortable", label: "Filas cómodas", icon: Rows2Icon },
  { value: "compact", label: "Filas compactas", icon: Rows4Icon },
];

/**
 * Presentational only: the caller decides where the choice lives, so a table
 * backed by a URL query and one backed by local state can share this control.
 */
export function DataTableDensityToggle({
  value,
  onChange,
  className,
}: {
  value: TableDensity;
  onChange: (next: TableDensity) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Densidad de filas"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const isActive = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            onClick={() => onChange(option)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
