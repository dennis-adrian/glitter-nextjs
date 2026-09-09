import Link from "next/link";

import {
  CONSOLE_LENSES,
  LENS_DESCRIPTIONS,
  LENS_LABELS,
  type ConsoleLens,
} from "@/app/lib/reservations/console-lenses";
import { cn } from "@/app/lib/utils";

/**
 * The lens switcher.
 *
 * Links rather than local state, so a queue can be sent to a colleague and an
 * admin can come back to the view they were working in.
 */
export default function LensTabs({
  festivalId,
  active,
}: {
  festivalId: number;
  active: ConsoleLens;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b" role="tablist">
      {CONSOLE_LENSES.map((lens) => {
        const isActive = lens === active;
        return (
          <Link
            key={lens}
            href={`/dashboard/festivals/${festivalId}/reservations?lens=${lens}`}
            role="tab"
            aria-selected={isActive}
            title={LENS_DESCRIPTIONS[lens]}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {LENS_LABELS[lens]}
          </Link>
        );
      })}
    </div>
  );
}
