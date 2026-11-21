import type { ReactNode } from "react";

import { Card, CardContent } from "@/app/components/ui/card";
import { cn } from "@/app/lib/utils";

export type StatTileTone = "amber" | "red";

const TONE_CLASSES: Record<StatTileTone, { card: string; value: string }> = {
  amber: {
    card: "border-amber-300 dark:border-amber-800",
    value: "text-amber-700 dark:text-amber-400",
  },
  red: {
    card: "border-red-300 dark:border-red-800",
    value: "text-red-600 dark:text-red-400",
  },
};

/**
 * One figure on a dashboard: a small uppercase label over a large number,
 * and an optional hint under it. `tone` colours the border and the number;
 * pass it only when the value calls for attention (e.g. above zero).
 */
export default function StatTile({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTileTone;
  className?: string;
}) {
  return (
    <Card className={cn("h-full", tone && TONE_CLASSES[tone].card, className)}>
      <CardContent className="flex flex-col gap-0.5 p-3">
        <span className="text-[11px] font-medium tracking-wide break-words text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={cn(
            "font-display text-2xl leading-tight font-semibold tabular-nums",
            tone && TONE_CLASSES[tone].value,
          )}
        >
          {value}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}
