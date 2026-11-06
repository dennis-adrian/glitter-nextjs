import Image from "next/image";

import type { Participation, ProfileType } from "@/app/api/users/definitions";
import { HubSection } from "@/app/components/participations/hub/hub-section";
import { formatDisplayDate } from "@/app/lib/formatters";
import { formatFestivalDays } from "@/app/lib/home/festival";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";

const SHOWN = 3;

function firstDay(participation: Participation) {
  const dates = participation.reservation.festival.festivalDates ?? [];
  return (
    [...dates].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0]
      ?.startDate ?? participation.reservation.createdAt
  );
}

/**
 * The latest past participations, newest first: each festival's poster as a
 * small 3:4 thumbnail, its name, its days and the stand. The festival's name
 * already says its type, so there is no type badge.
 */
export default function ParticipationHistoryPreview({
  profile,
  activeFestivalId,
  emptyState,
}: {
  profile: ProfileType;
  activeFestivalId?: number;
  /** Shown where the list would be, when the page has nothing else. */
  emptyState?: string;
}) {
  const seen = new Set<number>();
  const past = profile.participations
    .filter(
      (participation) =>
        participation.reservation.status === "accepted" &&
        participation.reservation.festivalId !== activeFestivalId,
    )
    .sort((a, b) => firstDay(b).getTime() - firstDay(a).getTime())
    // One row per festival: two stands in one edition are one participation.
    .filter((participation) => {
      if (seen.has(participation.reservation.festivalId)) return false;
      seen.add(participation.reservation.festivalId);
      return true;
    })
    .slice(0, SHOWN);

  if (past.length === 0) {
    return emptyState ? (
      <div className="rounded-2xl border border-dashed border-brand-lavender p-4 text-center text-sm text-brand-neutral">
        {emptyState}
      </div>
    ) : null;
  }

  return (
    <HubSection
      title="Participaciones pasadas"
      action={{ label: "Ver todo", href: "/my_history" }}
    >
      <ul className="flex flex-col gap-2">
        {past.map((participation) => {
          const { festival } = participation.reservation;
          const dates = festival.festivalDates ?? [];
          const year = formatDisplayDate(firstDay(participation), {
            year: "numeric",
          });
          const days = formatFestivalDays(dates);
          const poster = festival.posterUrl ?? festival.thumbnailUrl;

          return (
            <li
              key={participation.id}
              className="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-card p-3"
            >
              <span className="relative block aspect-3/4 w-11 shrink-0 overflow-hidden rounded-lg bg-brand-lavender/40 shadow-sm">
                {poster ? (
                  <Image
                    src={poster}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-display text-base font-bold text-brand-ink">
                  {festival.name}
                </span>
                <span className="text-xs text-brand-neutral">
                  {[days ? `${days} de ${year}` : year, `Stand ${reservationStandLabel(participation.reservation)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </HubSection>
  );
}
