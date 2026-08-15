"use client";

import type { UserCategory } from "@/app/api/users/definitions";
import { getPublicCategoryLabel } from "@/app/lib/maps/helpers";
import { cn } from "@/app/lib/utils";

export type ParticipantCategoryFilter = "all" | UserCategory;

export default function FestivalParticipantCategoryFilters({
  categories,
  value,
  onChange,
}: {
  categories: UserCategory[];
  value: ParticipantCategoryFilter;
  onChange: (category: ParticipantCategoryFilter) => void;
}) {
  if (categories.length < 2) return null;

  return (
    <div
      role="group"
      className="no-scrollbar flex gap-2 overflow-x-auto py-1"
      aria-label="Filtrar participantes por categoría"
    >
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={cn(
          "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          value === "all"
            ? "border-primary bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:border-primary/50 hover:text-primary",
        )}
      >
        Todas las categorías
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={value === category}
          onClick={() => onChange(category)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value === category
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:border-primary/50 hover:text-primary",
          )}
        >
          {getPublicCategoryLabel(category)}
        </button>
      ))}
    </div>
  );
}
