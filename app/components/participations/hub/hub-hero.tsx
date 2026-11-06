import Link from "next/link";

import { MapIcon } from "lucide-react";

import FestivalBanner from "@/app/components/festivals/festival-banner";
import { hasFestivalBanner } from "@/app/lib/festivals/banner";
import type { FullFestival } from "@/app/lib/festivals/definitions";
import { formatDaysLeft, formatFestivalDays } from "@/app/lib/home/festival";
import { daysUntil } from "@/app/lib/participations/hub-status";

/**
 * The festival at the top of the hub: its banner, shown whole and never
 * covered (it carries its own title, dates and art), linking to the public
 * page; under it a bar with the name, the countdown, the dates and venue, and
 * the map, the one place the hub links it from.
 */
export default function HubHero({
  festival,
  mapHref,
  now = new Date(),
}: {
  festival: FullFestival;
  mapHref: string;
  now?: Date;
}) {
  const sortedDates = [...festival.festivalDates].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  const countdown = formatDaysLeft(daysUntil(sortedDates[0]?.startDate, now));
  const line = [formatFestivalDays(festival.festivalDates), festival.locationLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-card">
      {hasFestivalBanner(festival) ? (
        <Link
          href={`/festivals/${festival.id}`}
          aria-label={`Ver ${festival.name}`}
          className="block"
        >
          <FestivalBanner
            festival={festival}
            alt={`${festival.name}${line ? `, ${line}` : ""}`}
            sizes="(min-width: 1024px) 720px, 100vw"
            highPriority
          />
        </Link>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold leading-none text-brand-ink md:text-2xl">
              {festival.name}
            </h2>
            {countdown ? (
              <span className="rounded-full bg-brand-coral px-2 py-0.5 text-[11px] font-bold text-white">
                {countdown}
              </span>
            ) : null}
          </div>
          {line ? (
            <p className="text-xs text-brand-neutral md:text-sm">{line}</p>
          ) : null}
        </div>
        <Link
          href={mapHref}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-brand-border bg-brand-card px-3.5 text-sm font-semibold text-brand-ink hover:border-brand-primary hover:text-brand-primary"
        >
          <MapIcon className="size-4" aria-hidden="true" />
          Mapa
        </Link>
      </div>
    </div>
  );
}
