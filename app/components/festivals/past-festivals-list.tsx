import Image from "next/image";
import Link from "next/link";

import { ChevronRightIcon } from "lucide-react";

import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatDisplayDate } from "@/app/lib/formatters";
import { formatFestivalDays } from "@/app/lib/home/festival";

/**
 * "11 y 12 de abril de 2026"; across New Year each side keeps its own year:
 * "31 de diciembre de 2026 y 1 de enero de 2027".
 */
export function festivalWhen(festival: Pick<FestivalWithDates, "festivalDates">) {
  const days = [...festival.festivalDates].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  const first = days[0]?.startDate;
  const last = days[days.length - 1]?.startDate;
  if (!first || !last) return null;
  const year = (date: Date) => formatDisplayDate(date, { year: "numeric" });
  if (year(first) !== year(last)) {
    const full = (date: Date) =>
      `${formatDisplayDate(date, { day: "numeric" })} de ${formatDisplayDate(date, { month: "long" })} de ${year(date)}`;
    return `${full(first)} ${days.length === 2 ? "y" : "al"} ${full(last)}`;
  }
  return `${formatFestivalDays(festival.festivalDates)} de ${year(last)}`;
}

/**
 * The festivals that have already happened, each opening its public page:
 * participants, map and activities stay there after the festival ends. Each
 * shows its poster as a small 3:4 thumbnail; the name already says the
 * festival's type, so there is no type label.
 */
export default function PastFestivalsList({
  festivals,
}: {
  festivals: FestivalWithDates[];
}) {
  if (festivals.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-brand-lavender p-4 text-center text-sm text-brand-neutral">
        Todavía no hay festivales anteriores.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {festivals.map((festival) => {
        const poster = festival.posterUrl ?? festival.thumbnailUrl;
        const line = [festivalWhen(festival), festival.locationLabel]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={festival.id} className="min-w-0">
            <Link
              href={`/festivals/${festival.id}`}
              className="flex h-full items-center gap-3 rounded-2xl border border-brand-border bg-brand-card p-3 transition-colors hover:border-brand-primary"
            >
              <span className="relative block aspect-3/4 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-lavender/40 shadow-sm">
                {poster ? (
                  <Image
                    src={poster}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-display text-base font-bold leading-tight text-brand-ink">
                  {festival.name}
                </span>
                {line ? (
                  <span className="text-xs text-brand-neutral">{line}</span>
                ) : null}
              </span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-brand-neutral"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
