import Image from "next/image";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import type { PublicFestivalPage } from "@/app/lib/festivals/definitions";
import { formatDisplayDate, formatTime } from "@/app/lib/formatters";
import { formatDaysLeft, formatFestivalDays } from "@/app/lib/home/festival";
import { daysUntil } from "@/app/lib/participations/hub-status";

type FestivalPageHeroProps = {
  festival: PublicFestivalPage;
  hasFastPass: boolean;
  now?: Date;
};

function sortedDates(festival: PublicFestivalPage) {
  return [...festival.festivalDates].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
}

/**
 * "10:00 AM a 7:00 PM" when every day keeps the same hours; otherwise each
 * day with its own: "sáb 10:00 AM a 7:00 PM · dom 11:00 AM a 8:00 PM".
 */
export function hoursLine(festival: Pick<PublicFestivalPage, "festivalDates">) {
  const days = [...festival.festivalDates]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((day) => ({
      weekday: formatDisplayDate(day.startDate, { weekday: "short" }).replace(
        /\.$/,
        "",
      ),
      hours: `${formatTime(day.startDate)} a ${formatTime(day.endDate)}`,
    }));
  if (days.length === 0) return null;
  if (days.every((day) => day.hours === days[0].hours)) return days[0].hours;
  return days.map((day) => `${day.weekday} ${day.hours}`).join(" · ");
}

/**
 * The top of a festival's public page, kept short: the banner shown whole
 * (it carries its own title, dates and art, so nothing is laid over it), a
 * bar with the name, the days, the venue and the countdown, and one button
 * for the ticket. The guide under it leads to the map, the participants and
 * the activities further down the same page.
 */
export default function FestivalPageHero({
  festival,
  hasFastPass,
  now = new Date(),
}: FestivalPageHeroProps) {
  const isRegistrationOpen =
    festival.status === "active" && festival.publicRegistration;
  const primaryHref = isRegistrationOpen
    ? `/festivals/${festival.id}/registration`
    : hasFastPass
      ? `/festivals/${festival.id}/fast-pass`
      : null;
  const primaryLabel = isRegistrationOpen
    ? "Obtener entrada"
    : hasFastPass
      ? "Comprar Pase Rápido"
      : null;

  const line = [
    formatFestivalDays(festival.festivalDates),
    festival.locationLabel,
    formatDaysLeft(daysUntil(sortedDates(festival)[0]?.startDate, now)),
  ]
    .filter(Boolean)
    .join(" · ");
  // The public registration is the free ticket; the admin settings say so.
  const ticketLine = [
    isRegistrationOpen ? "Entrada gratuita" : null,
    hoursLine(festival),
  ]
    .filter(Boolean)
    .join(" · ");
  // Without a banner, the poster keeps the festival's art on the page.
  const poster = festival.festivalBannerUrl
    ? null
    : (festival.posterUrl ?? festival.thumbnailUrl);

  return (
    <section
      id="entrada"
      className="container mx-auto flex max-w-7xl flex-col gap-3 px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8"
    >
      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-card">
        {festival.festivalBannerUrl ? (
          <Image
            src={festival.festivalBannerUrl}
            alt={`${festival.name}${line ? `, ${line}` : ""}`}
            width={2000}
            height={667}
            priority
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="h-auto w-full"
          />
        ) : null}
        <div className="flex items-center gap-4 p-4 sm:p-5">
          {poster ? (
            <span className="relative block aspect-3/4 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-lavender/40 shadow-sm sm:w-20">
              <Image
                src={poster}
                alt={`Afiche de ${festival.name}`}
                fill
                priority
                sizes="80px"
                className="object-cover"
              />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-balance font-display text-2xl font-bold leading-tight tracking-tight text-brand-ink sm:text-3xl">
              {festival.name}
            </h1>
            {line ? (
              <p className="text-sm text-brand-neutral">{line}</p>
            ) : null}
            {ticketLine ? (
              <p className="text-sm font-semibold text-brand-ink">
                {ticketLine}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {primaryHref && primaryLabel ? (
        <Button asChild className="h-11 w-full rounded-full sm:max-w-md">
          <Link href={primaryHref}>{primaryLabel}</Link>
        </Button>
      ) : (
        <div className="flex flex-col gap-1 sm:max-w-md">
          <Button disabled className="h-11 w-full rounded-full">
            Obtener entrada
          </Button>
          <p className="text-center text-xs text-brand-neutral">
            No hay entradas habilitadas
          </p>
        </div>
      )}
    </section>
  );
}
