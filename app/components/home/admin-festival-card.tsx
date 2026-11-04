import Link from "next/link";

import FestivalBanner from "@/app/components/festivals/festival-banner";
import { HubSection } from "@/app/components/participations/hub/hub-section";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import type { FestivalOverviewCounts } from "@/app/lib/festivals/overview";
import { formatDaysLeft, formatFestivalDays } from "@/app/lib/home/festival";
import { daysUntil } from "@/app/lib/participations/hub-status";

function figure(value: number) {
  return value.toLocaleString("es-BO");
}

/**
 * The festival in progress for staff: its banner, shown whole, and the three
 * figures worth a glance. The card opens the festival's admin page.
 */
export default function AdminFestivalCard({
  festival,
  counts,
  now = new Date(),
}: {
  festival: FestivalWithDates;
  counts: FestivalOverviewCounts;
  now?: Date;
}) {
  const first = [...festival.festivalDates].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  )[0]?.startDate;
  const line = [
    formatFestivalDays(festival.festivalDates),
    festival.locationLabel,
    formatDaysLeft(daysUntil(first, now)),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <HubSection
      title="Festival en curso"
      action={{ label: "Gestionar", href: `/dashboard/festivals/${festival.id}` }}
    >
      <Link
        href={`/dashboard/festivals/${festival.id}`}
        className="flex flex-col overflow-hidden rounded-2xl border border-brand-border bg-brand-card transition-colors hover:border-brand-primary"
      >
        <FestivalBanner
          festival={festival}
          alt={`${festival.name}${line ? `, ${line}` : ""}`}
          sizes="(min-width: 1024px) 560px, 100vw"
        />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-xl font-bold leading-tight text-brand-ink">
              {festival.name}
            </span>
            {line ? (
              <span className="text-sm text-brand-neutral">{line}</span>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <div className="flex flex-col">
              <dt className="order-2 text-xs text-brand-neutral">
                personas con entrada
              </dt>
              <dd className="order-1 font-display text-xl font-bold text-brand-ink">
                {figure(counts.ticketHolders)}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="order-2 text-xs text-brand-neutral">
                reservas activas
              </dt>
              <dd className="order-1 font-display text-xl font-bold text-brand-ink">
                {figure(counts.reservations)}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="order-2 text-xs text-brand-neutral">actividades</dt>
              <dd className="order-1 font-display text-xl font-bold text-brand-ink">
                {figure(counts.activities)}
              </dd>
            </div>
          </dl>
        </div>
      </Link>
    </HubSection>
  );
}
