import Link from "next/link";

import { ChevronRightIcon } from "lucide-react";

import FestivalBanner from "@/app/components/festivals/festival-banner";
import { HubSection } from "@/app/components/participations/hub/hub-section";
import { Badge } from "@/app/components/ui/badge";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatDaysLeft, formatFestivalDays } from "@/app/lib/home/festival";
import { cn } from "@/app/lib/utils";

/**
 * The festival in its banner, the whole card one link: to Participaciones for
 * a verified participant, to the public page for everyone else. The banner is
 * shown whole, never cropped or covered; its painted "Más información" is
 * true because the banner itself is the link.
 */
export default function HomeFestivalCard({
  title,
  festival,
  href,
  daysLeft,
  badge,
  sentence,
}: {
  title: string;
  festival: Pick<
    FestivalWithDates,
    | "id"
    | "name"
    | "festivalBannerUrl"
    | "festivalBannerMobileUrl"
    | "locationLabel"
    | "festivalDates"
  >;
  href: string;
  daysLeft: number | null;
  badge?: { label: string; badgeStyle?: string } | null;
  /** Where the participation stands, in one sentence. */
  sentence?: string | null;
}) {
  const line = [
    formatFestivalDays(festival.festivalDates),
    festival.locationLabel,
    formatDaysLeft(daysLeft),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <HubSection title={title}>
      <Link
        href={href}
        className="group flex flex-col overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm transition-colors hover:border-brand-primary"
      >
        <FestivalBanner
          festival={festival}
          alt={`${festival.name}${line ? `, ${line}` : ""}`}
          sizes="(min-width: 1024px) 640px, 100vw"
          highPriority
        />
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-xl font-bold leading-tight text-brand-ink md:text-2xl">
              {festival.name}
            </span>
            {badge ? (
              <Badge className={cn("shrink-0", badge.badgeStyle)}>
                {badge.label}
              </Badge>
            ) : null}
          </div>
          {line ? (
            <span className="text-sm text-brand-neutral">{line}</span>
          ) : null}
          {sentence ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
              <span className="min-w-0 flex-1">{sentence}</span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-brand-neutral group-hover:text-brand-primary"
                aria-hidden="true"
              />
            </span>
          ) : null}
        </div>
      </Link>
    </HubSection>
  );
}
