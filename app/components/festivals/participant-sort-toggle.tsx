"use client";

import type { ParticipantSort } from "@/app/components/festivals/festival-visitor-filters";
import { cn } from "@/app/lib/utils";

const OPTIONS: { value: ParticipantSort; label: string }[] = [
  { value: "stand", label: "Por stand" },
  { value: "name", label: "Por nombre" },
];

export default function ParticipantSortToggle({
  value,
  onChange,
}: {
  value: ParticipantSort;
  onChange: (sort: ParticipantSort) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Ordenar participantes"
      className="flex shrink-0 gap-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value === option.value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:border-primary/50 hover:text-primary",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
