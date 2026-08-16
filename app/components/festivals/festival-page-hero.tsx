import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  MapIcon,
  MapPinIcon,
  SparklesIcon,
  TicketIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import { formatDate } from "@/app/lib/formatters";
import type { PublicFestivalPage } from "@/app/lib/festivals/definitions";

type FestivalPageHeroProps = {
  festival: PublicFestivalPage;
  hasFastPass: boolean;
};

function FestivalArtwork({ festival }: { festival: PublicFestivalPage }) {
  const artwork =
    festival.posterUrl ?? festival.festivalBannerUrl ?? festival.thumbnailUrl;

  if (artwork) {
    return (
      <Link
        href={artwork}
        target="_blank"
        rel="noreferrer"
        className="group relative block aspect-4/5 w-24 shrink-0 overflow-hidden rounded-xl bg-primary-100 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-32"
        aria-label={`Ver afiche completo de ${festival.name}`}
      >
        <Image
          src={artwork}
          alt={`Afiche de ${festival.name}`}
          fill
          priority
          sizes="128px"
          className="object-cover transition group-hover:scale-[1.02]"
        />
        <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/70 px-2 py-1 text-center text-[10px] font-semibold text-white opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Ver afiche
        </span>
      </Link>
    );
  }

  return (
    <div
      role="img"
      aria-label={`Identidad visual de ${festival.name}`}
      className="relative flex aspect-4/5 w-24 shrink-0 overflow-hidden rounded-xl bg-primary-700 p-3 text-white shadow-sm sm:w-32"
    >
      <div className="absolute -right-5 -top-4 size-16 rounded-full border-8 border-secondary-300/80" />
      <div className="absolute -bottom-5 -left-4 size-20 rounded-full bg-accent-400/80" />
      <SparklesIcon className="relative mt-auto size-6" aria-hidden="true" />
    </div>
  );
}

function formatFestivalDay(date: Date) {
  const startDate = formatDate(date);
  return {
    day: startDate.toFormat("cccc d 'de' LLLL"),
    time: startDate.toFormat("HH:mm"),
  };
}

function FestivalDateSummary({ festival }: { festival: PublicFestivalPage }) {
  const dates = [...festival.festivalDates].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (!firstDate) return <>Fecha por confirmar</>;

  const first = formatFestivalDay(firstDate.startDate);

  if (dates.length === 1 || !lastDate) {
    return (
      <>
        <span className="capitalize">{first.day}</span>
        <span aria-hidden="true"> · </span>
        {first.time} hrs
      </>
    );
  }

  const last = formatFestivalDay(lastDate.startDate);
  const sameTime = first.time === last.time;

  return (
    <>
      <span className="capitalize">{first.day}</span>
      {sameTime ? (
        <>
          <span aria-hidden="true"> – </span>
          <span className="capitalize">{last.day}</span>
          <span aria-hidden="true"> · </span>
          {first.time} hrs
        </>
      ) : (
        <>
          <span aria-hidden="true"> · </span>
          {first.time} hrs
          <span aria-hidden="true"> – </span>
          <span className="capitalize">{last.day}</span>
          <span aria-hidden="true"> · </span>
          {last.time} hrs
        </>
      )}
    </>
  );
}

export default function FestivalPageHero({
  festival,
  hasFastPass,
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
  const registrationHelperText =
    "Registrate y obtené tu entrada para presentar al ingresar";

  return (
    <>
      <section id="entrada" className="border-b bg-primary-50/70">
        <div className="container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start">
            <div className="flex min-w-0 gap-4 sm:gap-5">
              <FestivalArtwork festival={festival} />

              <div className="min-w-0 self-start">
                <h1 className="text-balance font-space-grotesk text-3xl font-bold leading-none tracking-tight sm:text-4xl">
                  {festival.name}
                </h1>
                <div className="mt-4 space-y-2 text-sm">
                  <p className="flex items-start gap-2">
                    <CalendarDaysIcon
                      className="mt-0.5 size-4 shrink-0 text-primary-700"
                      aria-hidden="true"
                    />
                    <span>
                      <FestivalDateSummary festival={festival} />
                    </span>
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPinIcon
                      className="mt-0.5 size-4 shrink-0 text-primary-700"
                      aria-hidden="true"
                    />
                    <span>
                      {festival.locationLabel || "Ubicación por confirmar"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 md:col-start-1 md:row-start-2 md:pl-37">
              <Link
                href="#mapa"
                className="inline-flex items-center text-sm font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <MapIcon className="mr-1.5 size-4" aria-hidden="true" />
                Mapa y participantes
              </Link>
              {festival.festivalActivities.length > 0 ? (
                <Link
                  href="#actividades"
                  className="inline-flex items-center text-sm font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <SparklesIcon className="mr-1.5 size-4" aria-hidden="true" />
                  Actividades
                </Link>
              ) : null}
              {festival.locationUrl ? (
                <Link
                  href={festival.locationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-sm font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Cómo llegar
                  <ArrowUpRightIcon
                    className="ml-1 size-4"
                    aria-hidden="true"
                  />
                </Link>
              ) : null}
            </div>

            <div className="rounded-xl border bg-background p-4 shadow-sm md:col-start-2 md:row-span-2 md:row-start-1">
              <div className="flex items-center gap-2 text-primary-700">
                <TicketIcon className="size-4" aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-[0.14em]">
                  Tu entrada
                </p>
              </div>
              {primaryHref && primaryLabel ? (
                <>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
                    {registrationHelperText}
                  </p>
                  <Button asChild className="mt-4 w-full">
                    <Link href={primaryHref}>{primaryLabel}</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
                    No hay entradas habilitadas
                  </p>
                  <Button disabled className="mt-4 w-full">
                    Obtener entrada
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
