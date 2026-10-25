import Image from "next/image";
import Link from "next/link";

import { MapIcon } from "lucide-react";

import { getFestivalDateLabel } from "@/app/helpers/next_event";
import type { FullFestival } from "@/app/lib/festivals/definitions";
import { daysUntil } from "@/app/lib/participations/hub-status";

/**
 * The festival at the top of the hub: its poster under a dark wash, its name,
 * dates and venue, and the map — the one place the hub links it from.
 */
export default function HubHero({
  festival,
  mapHref,
  eyebrow,
  now = new Date(),
}: {
  festival: FullFestival;
  mapHref: string;
  /** The line above the name: "En curso", "Inscripciones abiertas"… */
  eyebrow: string;
  now?: Date;
}) {
  const artwork = festival.posterUrl ?? festival.festivalBannerUrl;
  const remaining = daysUntil(festival.festivalDates[0]?.startDate, now);

  return (
    <div className="relative isolate flex min-h-44 flex-col justify-end overflow-hidden rounded-3xl bg-brand-deep p-5 text-white md:min-h-52 md:p-6">
      {artwork ? (
        <Image
          src={artwork}
          alt=""
          fill
          sizes="(min-width: 1024px) 720px, 100vw"
          className="-z-20 object-cover"
          priority
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-b from-brand-deep/20 via-brand-deep/60 to-brand-deep/95"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">
          {eyebrow}
        </span>
        {remaining ? (
          <span className="rounded-full bg-brand-coral px-2.5 py-0.5 text-xs font-bold text-white">
            {remaining === 1 ? "falta 1 día" : `faltan ${remaining} días`}
          </span>
        ) : null}
      </div>
      <h2 className="mt-1 font-display text-3xl font-bold leading-none md:text-4xl">
        {festival.name}
      </h2>
      <p className="mt-1.5 text-sm text-white/85">
        {getFestivalDateLabel(festival)}
        {festival.locationLabel ? ` · ${festival.locationLabel}` : ""}
      </p>
      <div className="mt-3">
        <Link
          href={mapHref}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-brand-deep hover:bg-white/90"
        >
          <MapIcon className="size-4" aria-hidden="true" />
          Mapa
        </Link>
      </div>
    </div>
  );
}
