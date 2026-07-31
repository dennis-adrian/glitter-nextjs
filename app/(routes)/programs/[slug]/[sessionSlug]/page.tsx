import {
  ArrowDownIcon,
  ArrowLeftIcon,
  Clock3Icon,
  GaugeIcon,
  MapPinIcon,
  SparklesIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import GlitterWeekLockup from "@/app/components/programs/glitter-week-lockup";
import OccurrenceScheduleList from "@/app/components/programs/occurrence-schedule-list";
import ParticipantDiscountHint from "@/app/components/programs/participant-discount-hint";
import SmoothScrollLink from "@/app/components/programs/smooth-scroll-link";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { formatDate } from "@/app/lib/formatters";
import {
  DEFAULT_PROGRAM_ARTWORK,
  isAllowedProgramArtworkUrl,
} from "@/app/lib/programs/artwork";
import {
  fetchProgramSettings,
  fetchPublishedSession,
  fetchPublishedSessionRouteParams,
  fetchVenues,
} from "@/app/lib/programs/data";
import { SESSION_SKILL_LEVEL_LABELS } from "@/app/lib/programs/definitions";
import {
  formatMoney,
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
} from "@/app/lib/programs/pricing";
import { getAvailabilityForOccurrences } from "@/app/lib/programs/registration-actions";
import { cn } from "@/app/lib/utils";
import { citrusGothicSolid } from "@/app/ui/fonts";

type Props = {
  params: Promise<{ slug: string; sessionSlug: string }>;
};

export const dynamic = "force-static";
export const revalidate = 60;

export async function generateStaticParams() {
  return fetchPublishedSessionRouteParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, sessionSlug } = await params;
  const session = await fetchPublishedSession(slug, sessionSlug);

  if (!session) return { title: "Sesión" };

  // Every candidate is host-checked, including the banner: the schema validates
  // new records, but rows predating it can still hold an arbitrary URL, and an
  // OG image is emitted to third parties.
  const socialImage =
    session.sessionSpeakers.find((entry) =>
      isAllowedProgramArtworkUrl(entry.speaker.imageUrl),
    )?.speaker.imageUrl ??
    (isAllowedProgramArtworkUrl(session.program.bannerUrl)
      ? session.program.bannerUrl
      : DEFAULT_PROGRAM_ARTWORK);

  return {
    title: session.title,
    description: session.description ?? undefined,
    openGraph: {
      title: session.title,
      description: session.description ?? undefined,
      images: [socialImage],
    },
  };
}

export default async function SessionPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs", null);

  const { slug, sessionSlug } = await params;
  const [session, settings, venues] = await Promise.all([
    fetchPublishedSession(slug, sessionSlug),
    fetchProgramSettings(),
    fetchVenues(),
  ]);

  if (!session) notFound();

  const priceInput = {
    publicPrice: session.publicPrice,
    participantPrice: session.participantPrice,
    programDiscount: programDiscountFrom(session.program),
    globalDiscount: globalDiscountFrom(settings),
  };
  const publicPrice = resolvePrice(priceInput, "public").amount;
  const participantPrice = resolvePrice(
    priceInput,
    "active_participant",
  ).amount;

  const availabilityByOccurrence = await getAvailabilityForOccurrences(
    session.occurrences.map((occurrence) => occurrence.id),
  );

  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  const outcomes = session.learningOutcomes ?? [];
  const speakerPortraits = session.sessionSpeakers.flatMap((entry) =>
    isAllowedProgramArtworkUrl(entry.speaker.imageUrl)
      ? [{ ...entry, imageUrl: entry.speaker.imageUrl }]
      : [],
  );
  const nextOccurrence =
    session.occurrences.find(
      (occurrence) => occurrence.lifecycleStatus === "scheduled",
    ) ?? session.occurrences[0];
  const primaryVenueId =
    nextOccurrence?.venueId ??
    session.venueId ??
    session.program.defaultVenueId ??
    null;
  const primaryVenue =
    primaryVenueId === null ? null : venuesById.get(primaryVenueId);
  const durationMinutes = nextOccurrence
    ? Math.round(
        (nextOccurrence.endsAt.getTime() - nextOccurrence.startsAt.getTime()) /
          60_000,
      )
    : null;

  return (
    <div className="overflow-hidden bg-[#fffaf3] text-[#4b255f]">
      <section className="relative overflow-hidden bg-[#9347f5] text-[#fffaf3]">
        <div
          aria-hidden="true"
          className="absolute -left-28 top-28 size-80 rounded-full bg-[#ffc1fd]/30"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-20 size-72 rounded-full bg-[#72e5e7]/20"
        />

        <div className="container relative mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-6 sm:px-8 lg:px-12">
          <Link
            href={`/programs/${session.program.slug}`}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] decoration-[#ffbe57] decoration-2 underline-offset-4 hover:underline"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Volver al programa
          </Link>
          <GlitterWeekLockup compact title={session.program.name} />
        </div>

        <div
          className={cn(
            "container relative mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-4 sm:px-8 lg:items-center lg:gap-16 lg:px-12 lg:pb-24",
            speakerPortraits.length > 0 &&
              "lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]",
          )}
        >
          <div
            className={cn(
              "flex flex-col",
              speakerPortraits.length === 0 && "max-w-6xl",
            )}
          >
            <h1
              className={`${citrusGothicSolid.className} max-w-[13ch] text-balance text-[clamp(3.5rem,12vw,6rem)] uppercase leading-[0.87] tracking-[0.01em] lg:text-[clamp(4.5rem,6.5vw,7rem)]`}
            >
              {session.title}
            </h1>

            {session.sessionSpeakers.length > 0 ? (
              <p className="mt-6 max-w-xl text-lg font-black sm:text-xl">
                {session.type === "workshop"
                  ? session.sessionSpeakers.length === 1
                    ? "Facilita"
                    : "Facilitan"
                  : session.sessionSpeakers.length === 1
                    ? "Expone"
                    : "Exponen"}{" "}
                <span className="text-[#c9f4ef]">
                  {session.sessionSpeakers
                    .map((entry) => entry.speaker.publicName)
                    .join(", ")}
                </span>
              </p>
            ) : null}

            <dl
              className={cn(
                "order-2 mt-8 grid gap-3 sm:order-1 sm:grid-cols-2",
                speakerPortraits.length === 0 && "lg:grid-cols-4",
              )}
            >
              <div className="rounded-[1.5rem] bg-white/12 p-4">
                <dt className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#dff8f4]">
                  <Clock3Icon className="size-4" />
                  {session.occurrences.length === 1 ? "Fecha" : "Primera fecha"}
                </dt>
                <dd className="font-black">
                  {nextOccurrence
                    ? formatDate(nextOccurrence.startsAt).toLocaleString(
                        DateTime.DATETIME_MED,
                      )
                    : "Por anunciar"}
                </dd>
              </div>
              <div className="rounded-[1.5rem] bg-white/12 p-4">
                <dt className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#dff8f4]">
                  <MapPinIcon className="size-4" />
                  Lugar
                </dt>
                <dd className="font-black">
                  {primaryVenue?.name ?? "Por anunciar"}
                </dd>
              </div>
              <div className="rounded-[1.5rem] bg-white/12 p-4">
                <dt className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#dff8f4]">
                  <GaugeIcon className="size-4" />
                  Nivel
                </dt>
                <dd className="font-black">
                  {session.skillLevel
                    ? SESSION_SKILL_LEVEL_LABELS[session.skillLevel]
                    : "Por anunciar"}
                </dd>
              </div>
              <div className="rounded-[1.5rem] bg-white/12 p-4">
                <dt className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#dff8f4]">
                  <SparklesIcon className="size-4" />
                  Inversión
                </dt>
                <dd className="font-black">
                  {formatMoney(publicPrice)}
                  {durationMinutes ? (
                    <span className="ml-2 text-sm font-semibold text-[#e5d5ff]">
                      · {durationMinutes} min
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>

            {participantPrice !== publicPrice ? (
              <div className="order-3 sm:order-2">
                <ParticipantDiscountHint />
              </div>
            ) : null}

            <SmoothScrollLink
              targetId="horarios"
              className="order-1 mt-7 inline-flex min-h-12 items-center gap-2 self-start rounded-full bg-[#ffbe57] px-6 text-sm font-black uppercase tracking-[0.08em] text-[#4b255f] transition hover:-translate-y-0.5 hover:bg-[#ffd477] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 sm:order-3"
            >
              Elegir horario
              <ArrowDownIcon className="size-4" aria-hidden="true" />
            </SmoothScrollLink>
          </div>

          {speakerPortraits.length > 0 ? (
            <div
              aria-label="Retratos de quienes facilitan la sesión"
              className={cn(
                "grid gap-4",
                speakerPortraits.length > 1 && "sm:grid-cols-2 lg:grid-cols-1",
                speakerPortraits.length > 1 && "xl:grid-cols-2",
              )}
            >
              {speakerPortraits.map((entry, index) => (
                <figure
                  key={entry.id}
                  className={cn(
                    "relative min-h-[360px] overflow-hidden bg-[#72e5e7]",
                    index % 2 === 0
                      ? "rounded-[3rem_3rem_1rem_3rem]"
                      : "rounded-[3rem_1rem_3rem_3rem]",
                    speakerPortraits.length === 1 && "lg:min-h-[620px]",
                  )}
                >
                  <Image
                    src={entry.imageUrl}
                    alt={entry.speaker.publicName}
                    fill
                    priority={index === 0}
                    sizes={
                      speakerPortraits.length === 1
                        ? "(min-width: 1024px) 38vw, 100vw"
                        : "(min-width: 1280px) 19vw, (min-width: 1024px) 38vw, 50vw"
                    }
                    className="object-cover"
                  />
                  <figcaption className="absolute inset-x-4 bottom-4 rounded-[1.3rem] bg-[#fffaf3] px-4 py-3 text-[#4b255f]">
                    <span className="block font-black">
                      {entry.speaker.publicName}
                    </span>
                    {entry.speaker.occupation ? (
                      <span className="mt-1 block text-sm font-semibold text-[#70566f]">
                        {entry.speaker.occupation}
                      </span>
                    ) : null}
                    {entry.role ? (
                      <span className="mt-1 block text-xs font-bold uppercase tracking-[0.12em] text-[#9347f5]">
                        {entry.role}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="bg-[#fffaf3]">
        <div className="container mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-20 lg:px-12">
          <div>
            {session.description ? (
              <section>
                <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#e639b5]">
                  Sobre la sesión
                </p>
                <h2
                  className={`${citrusGothicSolid.className} mb-7 text-5xl uppercase leading-[0.92] sm:text-6xl`}
                >
                  Lo que vamos a explorar
                </h2>
                <p className="whitespace-pre-line text-lg font-medium leading-relaxed text-[#644868]">
                  {session.description}
                </p>
              </section>
            ) : null}

            {outcomes.length > 0 ? (
              <section className="mt-14">
                <h2
                  className={`${citrusGothicSolid.className} mb-7 text-5xl uppercase leading-[0.92] sm:text-6xl`}
                >
                  Lo que aprenderás
                </h2>
                <ol className="grid gap-4 sm:grid-cols-2">
                  {outcomes.map((outcome, index) => (
                    <li
                      key={outcome}
                      className={`rounded-[1.7rem] p-5 font-bold leading-relaxed ${
                        index % 3 === 0
                          ? "bg-[#dff8f4]"
                          : index % 3 === 1
                            ? "bg-[#ffe3a9]"
                            : "bg-[#f7d2ef]"
                      }`}
                    >
                      <span className="mb-4 block text-xs font-black uppercase tracking-[0.15em] text-[#9347f5]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {outcome}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <section id="horarios" tabIndex={-1} className="scroll-mt-28">
            <div className="rounded-[2.5rem] bg-[#ffbe57] p-5 sm:p-7 lg:sticky lg:top-28">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#7b3b76]">
                Reserva tu lugar
              </p>
              <h2
                className={`${citrusGothicSolid.className} mb-6 text-5xl uppercase leading-[0.92]`}
              >
                Elige un horario
              </h2>
              <OccurrenceScheduleList
                occurrences={session.occurrences}
                programStatus={session.program.status}
                sessionStatus={session.status}
                venuesById={venuesById}
                fallbackVenueId={
                  session.venueId ?? session.program.defaultVenueId ?? null
                }
                sessionTitle={session.title}
                availabilityByOccurrence={availabilityByOccurrence}
                audience={session.audience}
                publicPrice={publicPrice}
                participantPrice={participantPrice}
              />
            </div>
          </section>
        </div>
      </section>

      {session.sessionSpeakers.length > 0 ? (
        <section className="bg-[#72e5e7] py-16 sm:py-24">
          <div className="container mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <h2
              className={`${citrusGothicSolid.className} mb-10 text-5xl uppercase leading-none sm:text-7xl`}
            >
              Detrás de la sesión
            </h2>

            <ul className="grid gap-6 md:grid-cols-2">
              {session.sessionSpeakers.map((entry) => {
                const imageUrl = isAllowedProgramArtworkUrl(
                  entry.speaker.imageUrl,
                )
                  ? entry.speaker.imageUrl
                  : null;

                return (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[92px_1fr] gap-5 rounded-[2rem] bg-[#fffaf3] p-5 sm:grid-cols-[120px_1fr]"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-[1.5rem] bg-[#f7aee8]">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={entry.speaker.publicName}
                          fill
                          sizes="120px"
                          className="object-cover"
                        />
                      ) : (
                        <span
                          className={`${citrusGothicSolid.className} absolute inset-0 grid place-items-center text-5xl text-[#4b255f]`}
                        >
                          {entry.speaker.publicName.slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black">
                        {entry.speaker.publicName}
                      </h3>
                      {entry.speaker.occupation ? (
                        <p className="mt-1 text-sm font-bold text-[#70566f]">
                          {entry.speaker.occupation}
                        </p>
                      ) : null}
                      {entry.role ? (
                        <p className="mt-1 text-xs font-black uppercase tracking-[0.13em] text-[#9347f5]">
                          {entry.role}
                        </p>
                      ) : null}
                      {entry.speaker.bio ? (
                        <p className="mt-3 text-sm font-medium leading-relaxed text-[#70566f]">
                          {entry.speaker.bio}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
