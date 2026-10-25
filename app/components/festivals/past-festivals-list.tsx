import Image from "next/image";
import Link from "next/link";

import {
  CalendarIcon,
  ChevronRightIcon,
  MapPinIcon,
  SparklesIcon,
} from "lucide-react";

import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatFestivalDateRange } from "@/app/lib/festivals/utils";

const FESTIVAL_TYPE_LABELS: Record<FestivalWithDates["festivalType"], string> =
  {
    glitter: "Glitter",
    twinkler: "Twinkler",
    festicker: "Festicker",
  };

/**
 * The festivals that have already happened, each opening its public page:
 * participants, map and activities stay there after the festival ends.
 */
export default function PastFestivalsList({
  festivals,
}: {
  festivals: FestivalWithDates[];
}) {
  if (festivals.length === 0) {
    return (
      <p className="rounded-2xl border border-brand-border bg-brand-card p-4 text-sm text-brand-neutral">
        Todavía no hay festivales anteriores.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {festivals.map((festival) => {
        const artwork =
          festival.thumbnailUrl ??
          festival.posterUrl ??
          festival.festivalBannerUrl;
        const dates = formatFestivalDateRange(festival.festivalDates);

        return (
          <li key={festival.id} className="min-w-0">
            <Link
              href={`/festivals/${festival.id}`}
              className="flex h-full items-center gap-3 rounded-2xl border border-brand-border bg-brand-card p-3 transition-colors hover:border-brand-primary"
            >
              <span className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-lavender text-brand-primary">
                {artwork ? (
                  <Image
                    src={artwork}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <SparklesIcon className="size-7" aria-hidden="true" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-primary">
                  {FESTIVAL_TYPE_LABELS[festival.festivalType]}
                </span>
                <span className="truncate font-display text-base font-bold leading-tight text-brand-ink">
                  {festival.name}
                </span>
                {dates ? (
                  <span className="flex items-center gap-1 text-xs text-brand-neutral">
                    <CalendarIcon className="size-3.5" aria-hidden="true" />
                    {dates}
                  </span>
                ) : null}
                {festival.locationLabel ? (
                  <span className="flex min-w-0 items-center gap-1 text-xs text-brand-neutral">
                    <MapPinIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{festival.locationLabel}</span>
                  </span>
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
