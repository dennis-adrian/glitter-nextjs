import { ArrowUpRightIcon, MapPinIcon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import { cn } from "@/app/lib/utils";

export type VisitorActivityParticipant = {
  id: number;
  displayName: string;
  imageUrl: string | null;
  sectorName?: string;
  standLabel?: string;
};

export type VisitorActivity = Pick<
  FestivalActivity,
  "id" | "name" | "promotionalArtUrl" | "type"
> & {
  description: string;
  participants: VisitorActivityParticipant[];
};

type ActivityMarker = {
  label: string;
  symbol: string;
  className: string;
};

function getActivityMarker(type: FestivalActivity["type"]): ActivityMarker {
  if (type === "coupon_book") {
    return {
      label: "Cuponera",
      symbol: "%",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  if (type === "stamp_passport") {
    return {
      label: "Carrera de sellos",
      symbol: "★",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  if (type === "sticker_hunt") {
    return {
      label: "Cacería de stickers",
      symbol: "♦",
      className: "border-pink-200 bg-pink-50 text-pink-800",
    };
  }

  return {
    label: "Actividad del festival",
    symbol: "✦",
    className: "border-primary-200 bg-primary-50 text-primary-800",
  };
}

function ParticipantLink({
  marker,
  participant,
}: {
  marker: ActivityMarker;
  participant: VisitorActivityParticipant;
}) {
  const stand = participant.standLabel
    ? `Stand ${participant.standLabel}`
    : "Stand por confirmar";

  return (
    <Link
      href={`/public_profiles/${participant.id}`}
      className="group/participant flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3 transition hover:border-primary-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Avatar className="size-10 shrink-0">
        <AvatarImage
          src={participant.imageUrl ?? undefined}
          alt={participant.displayName}
        />
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold group-hover/participant:text-primary-700">
          {participant.displayName}
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
          {stand}
          {participant.sectorName ? ` · ${participant.sectorName}` : ""}
        </span>
      </span>
      <span
        role="img"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
          marker.className,
        )}
        aria-label={marker.label}
      >
        {marker.symbol}
      </span>
    </Link>
  );
}

export default function PublicFestivalActivities({
  activities,
}: {
  activities: VisitorActivity[];
}) {
  if (activities.length === 0) return null;

  return (
    <section id="actividades" tabIndex={-1} className="scroll-mt-24 space-y-7">
      <div className="max-w-2xl">
        <h2 className="font-space-grotesk text-3xl font-bold tracking-tight sm:text-4xl">
          Actividades para visitantes
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Conocé cada propuesta y qué stands necesitás visitar para participar.
        </p>
      </div>

      <div className="space-y-5">
        {activities.map((activity) => {
          const marker = getActivityMarker(activity.type);
          const visibleParticipants = activity.participants.slice(0, 6);
          const remainingParticipants = activity.participants.slice(6);

          return (
            <article
              key={activity.id}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <div className="grid gap-5 p-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-6">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-primary-50">
                  {activity.promotionalArtUrl ? (
                    <Image
                      src={activity.promotionalArtUrl}
                      alt=""
                      fill
                      sizes="128px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-primary-500">
                      <SparklesIcon className="size-8" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <Badge
                    variant="outline"
                    className={cn("rounded-full", marker.className)}
                  >
                    <span className="mr-1.5 font-bold" aria-hidden="true">
                      {marker.symbol}
                    </span>
                    {marker.label}
                  </Badge>
                  <h3 className="mt-3 font-space-grotesk text-2xl font-bold leading-tight">
                    {activity.name}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {activity.description}
                  </p>
                  <a
                    href="#mapa"
                    className="mt-4 inline-flex items-center text-sm font-semibold text-primary-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Ver marcadores en el mapa
                    <ArrowUpRightIcon
                      className="ml-1 size-4"
                      aria-hidden="true"
                    />
                  </a>
                </div>
              </div>

              <div className="border-t bg-muted/20 p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="font-semibold">
                    {activity.participants.length === 1
                      ? "1 participante confirmado"
                      : `${activity.participants.length} participantes confirmados`}
                  </h4>
                  {activity.participants.length > 0 ? (
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      Abrí un perfil para conocer su propuesta
                    </span>
                  ) : null}
                </div>

                {activity.participants.length > 0 ? (
                  <>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {visibleParticipants.map((participant) => (
                        <ParticipantLink
                          key={participant.id}
                          marker={marker}
                          participant={participant}
                        />
                      ))}
                    </div>

                    {remainingParticipants.length > 0 ? (
                      <details className="group mt-3">
                        <summary className="cursor-pointer list-none rounded-lg py-2 text-sm font-semibold text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="group-open:hidden">
                            Ver {remainingParticipants.length} más
                          </span>
                          <span className="hidden group-open:inline">
                            Mostrar menos
                          </span>
                        </summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {remainingParticipants.map((participant) => (
                            <ParticipantLink
                              key={participant.id}
                              marker={marker}
                              participant={participant}
                            />
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
                    Los participantes y sus stands aparecerán cuando estén
                    confirmados.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
