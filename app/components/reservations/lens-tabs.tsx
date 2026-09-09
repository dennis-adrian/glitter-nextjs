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
 *
 * Navigation semantics rather than a tablist, because that is what these are.
 * The ARIA tab pattern promises a screen reader user arrow-key movement between
 * tabs and a `tabpanel` holding the selected one's content; these links have
 * neither — each one loads a new page. Announcing them as tabs would advertise
 * an interaction that does not exist, so the active lens is marked with
 * `aria-current` instead, the attribute for "this is the page you are on".
 */
export default function LensTabs({
  festivalId,
  active,
}: {
  festivalId: number;
  active: ConsoleLens;
}) {
  return (
    <nav
      aria-label="Vistas de reservas"
      className="flex flex-wrap gap-1 border-b"
    >
      {CONSOLE_LENSES.map((lens) => {
        const isActive = lens === active;
        return (
          <Link
            key={lens}
            href={`/dashboard/festivals/${festivalId}/reservations?lens=${lens}`}
            aria-current={isActive ? "page" : undefined}
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
    </nav>
  );
}
