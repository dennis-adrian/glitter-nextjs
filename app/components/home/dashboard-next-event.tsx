import Link from "next/link";

import { CalendarDaysIcon, ChevronRightIcon } from "lucide-react";

import { getFestivalDateLabel } from "@/app/helpers/next_event";
import type { FullFestival } from "@/app/lib/festivals/definitions";
import { daysUntil } from "@/app/lib/participations/hub-status";
import { cn } from "@/app/lib/utils";

/**
 * The festival on a phone's home, where the desktop shows it as a tile:
 * its dates, venue and countdown, and a way to its public page.
 */
export default function DashboardNextEvent({
  festival,
  className,
  now = new Date(),
}: {
  festival: FullFestival;
  className?: string;
  now?: Date;
}) {
  const remaining = daysUntil(festival.festivalDates[0]?.startDate, now);
  const details = [
    festival.locationLabel,
    remaining
      ? remaining === 1
        ? "falta 1 día"
        : `faltan ${remaining} días`
      : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/festivals/${festival.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-card p-4 transition-colors hover:border-brand-primary",
        className,
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-lavender text-brand-primary">
        <CalendarDaysIcon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-brand-ink">
          {festival.name} · {getFestivalDateLabel(festival)}
        </span>
        {details.length > 0 ? (
          <span className="truncate text-xs text-brand-neutral">
            {details.join(" · ")}
          </span>
        ) : null}
      </span>
      <ChevronRightIcon
        className="size-4 shrink-0 text-brand-neutral"
        aria-hidden="true"
      />
    </Link>
  );
}
