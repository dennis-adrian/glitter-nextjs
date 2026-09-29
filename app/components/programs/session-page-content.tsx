import {
  ArrowDownIcon,
  Clock3Icon,
  GaugeIcon,
  MapPinIcon,
  TicketIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import Image from "next/image";

import LearningOutcomesList from "@/app/components/programs/learning-outcomes-list";
import OccurrenceScheduleList from "@/app/components/programs/occurrence-schedule-list";
import ParticipantDiscountHint from "@/app/components/programs/participant-discount-hint";
import ProgramArtworkFrame from "@/app/components/programs/program-artwork-frame";
import ProgramViewTracker from "@/app/components/programs/program-view-tracker";
import SessionContextHeader from "@/app/components/programs/session-context-header";
import SmoothScrollLink from "@/app/components/programs/smooth-scroll-link";
import ViewerSessionPrice from "@/app/components/programs/viewer-session-price";
import { buttonVariants } from "@/app/components/ui/button";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { formatDisplayDate } from "@/app/lib/formatters";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import { nextUpcomingOccurrence } from "@/app/lib/programs/catalogue";
import type { PublishedSession } from "@/app/lib/programs/data";
import {
  SESSION_SKILL_LEVEL_LABELS,
  SESSION_TYPE_LABELS,
  type ProgramSettings,
  type Venue,
} from "@/app/lib/programs/definitions";
import type { OccurrenceAvailability } from "@/app/lib/programs/inventory";
import {
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
} from "@/app/lib/programs/pricing";
import { cn } from "@/app/lib/utils";

type Props = {
  /** A program session or a standalone one; `session.program` tells which. */
  session: PublishedSession;
  settings: ProgramSettings;
  venues: Venue[];
  availabilityByOccurrence: Map<number, OccurrenceAvailability>;
  /**
   * When the page was rendered. This HTML is cached; the schedule hydrates
   * against the same instant, then moves to the browser clock.
   */
  renderedAt: Date;
};

/**
 * The public page of one session, shared by `/programs/{program}/{session}`
 * and `/programs/sessions/{session}`. The routes only fetch; everything that
 * differs between the two kinds is decided here from `session.program`.
 */
export default function SessionPageContent({
  session,
  settings,
  venues,
  availabilityByOccurrence,
  renderedAt,
}: Props) {
  const program = session.program;

  const priceInput = {
    publicPrice: session.publicPrice,
    participantPrice: session.participantPrice,
    programDiscount: programDiscountFrom(program),
    globalDiscount: globalDiscountFrom(settings),
  };
  const publicPrice = resolvePrice(priceInput, "public").amount;
  const participantPrice = resolvePrice(
    priceInput,
    "active_participant",
  ).amount;

  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  const fallbackVenueId = session.venueId ?? program?.defaultVenueId ?? null;
  const outcomes = session.learningOutcomes ?? [];
  const speakerPortraits = session.sessionSpeakers.flatMap((entry) =>
    isAllowedProgramArtworkUrl(entry.speaker.imageUrl)
      ? [{ ...entry, imageUrl: entry.speaker.imageUrl }]
      : [],
  );
  // The session's own artwork only stands in for portraits: next to faces it
  // would compete with them for the same slot.
  const sessionArtwork =
    speakerPortraits.length === 0 &&
    isAllowedProgramArtworkUrl(session.imageUrl)
      ? session.imageUrl
      : null;
  const hasHeroMedia = speakerPortraits.length > 0 || sessionArtwork !== null;

  // Same "upcoming" as the catalogue and the sales cut-off. Once every date
  // is over, the last one is the honest thing to show.
  const upcomingOccurrence = nextUpcomingOccurrence(
    session.occurrences,
    renderedAt,
  );
  const heroOccurrence =
    upcomingOccurrence ?? session.occurrences.at(-1) ?? null;
  const heroDateLabel =
    session.occurrences.length <= 1
      ? "Fecha"
      : upcomingOccurrence
        ? "Próxima fecha"
        : "Última fecha";
  const primaryVenueId = heroOccurrence?.venueId ?? fallbackVenueId;
  const primaryVenue =
    primaryVenueId === null ? null : venuesById.get(primaryVenueId);
  const durationMinutes = heroOccurrence
    ? Math.round(
        (heroOccurrence.endsAt.getTime() - heroOccurrence.startsAt.getTime()) /
          60_000,
      )
    : null;
  // Across every occurrence: the honest answer to "was anything still bookable
  // when they looked at this page", which drop-off numbers are unreadable
  // without.
  const seatsRemaining = [...availabilityByOccurrence.values()].reduce(
    (total, availability) => total + availability.remaining,
    0,
  );

  return (
    // overflow-x-clip, not overflow-hidden: hidden makes this a scroll
    // container, which leaves the booking panel's lg:sticky with nothing to
    // stick to.
    <div className="overflow-x-clip bg-brand-elevated text-brand-ink">
      <ProgramViewTracker
        event={POSTHOG_EVENTS.PROGRAM_SESSION_VIEWED}
        properties={{
          program_slug: program?.slug ?? null,
          is_standalone: program === null,
          session_slug: session.slug,
          session_title: session.title,
          session_type: session.type,
          skill_level: session.skillLevel,
          audience: session.audience,
          public_price: publicPrice,
          participant_price: participantPrice,
          occurrence_count: session.occurrences.length,
          seats_remaining: seatsRemaining,
        }}
      />
      <section className="relative bg-brand-lavender text-brand-ink">
        <SessionContextHeader
          program={program}
          festival={session.festival ?? null}
        />

        <div
          className={cn(
            "container relative mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-4 sm:px-8 lg:items-center lg:gap-16 lg:px-12 lg:pb-24",
            hasHeroMedia &&
              "lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]",
          )}
        >
          <div className={cn("flex flex-col", !hasHeroMedia && "max-w-6xl")}>
            <h1 className="max-w-[18ch] text-balance font-display text-4xl font-extrabold leading-[1.02] tracking-[-1px] sm:text-5xl lg:text-6xl">
              {session.title}
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-8 text-brand-ink/80">
              {SESSION_TYPE_LABELS[session.type]}
              {session.topic ? <> · {session.topic}</> : null}
              {session.sessionSpeakers.length > 0 ? (
                <>
                  {" · "}
                  {session.type === "workshop"
                    ? session.sessionSpeakers.length === 1
                      ? "Facilita"
                      : "Facilitan"
                    : session.sessionSpeakers.length === 1
                      ? "Expone"
                      : "Exponen"}{" "}
                  <span className="font-semibold text-brand-ink">
                    {session.sessionSpeakers
                      .map((entry) => entry.speaker.publicName)
                      .join(", ")}
                  </span>
                </>
              ) : null}
            </p>

            {/*
              Each icon sits in its dt, pulled into the item's left gutter: a
              dl group may only hold dt and dd.
            */}
            <dl
              className={cn(
                "order-2 mt-8 grid gap-x-8 gap-y-5 sm:order-1 sm:grid-cols-2",
                !hasHeroMedia && "lg:grid-cols-4",
              )}
            >
              <div className="relative pl-8">
                <dt className="text-sm text-brand-ink/75">
                  <Clock3Icon
                    aria-hidden="true"
                    className="absolute left-0 top-0.5 size-5 text-brand-primary"
                  />
                  {heroDateLabel}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {heroOccurrence
                    ? formatDisplayDate(
                        heroOccurrence.startsAt,
                        DateTime.DATETIME_MED,
                      )
                    : "Por anunciar"}
                </dd>
              </div>
              <div className="relative pl-8">
                <dt className="text-sm text-brand-ink/75">
                  <MapPinIcon
                    aria-hidden="true"
                    className="absolute left-0 top-0.5 size-5 text-brand-primary"
                  />
                  Lugar
                </dt>
                <dd className="font-semibold">
                  {primaryVenue?.name ?? "Por anunciar"}
                </dd>
              </div>
              <div className="relative pl-8">
                <dt className="text-sm text-brand-ink/75">
                  <GaugeIcon
                    aria-hidden="true"
                    className="absolute left-0 top-0.5 size-5 text-brand-primary"
                  />
                  Nivel
                </dt>
                <dd className="font-semibold">
                  {session.skillLevel
                    ? SESSION_SKILL_LEVEL_LABELS[session.skillLevel]
                    : "Por anunciar"}
                </dd>
              </div>
              <div className="relative pl-8">
                <dt className="text-sm text-brand-ink/75">
                  <TicketIcon
                    aria-hidden="true"
                    className="absolute left-0 top-0.5 size-5 text-brand-primary"
                  />
                  Inversión
                </dt>
                <dd className="font-semibold tabular-nums">
                  <ViewerSessionPrice
                    publicPrice={publicPrice}
                    participantPrice={participantPrice}
                  />
                  {durationMinutes ? (
                    <span className="ml-2 text-sm font-normal text-brand-ink/75">
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
              className={cn(
                buttonVariants({ variant: "cta", size: "lg" }),
                "order-1 mt-7 w-full gap-2 self-start sm:order-3 sm:w-fit",
              )}
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
                <figure key={entry.id} className="relative">
                  <ProgramArtworkFrame
                    src={entry.imageUrl}
                    alt={entry.speaker.publicName}
                    priority={index === 0}
                    sizes={
                      speakerPortraits.length === 1
                        ? "(min-width: 1024px) 38vw, 100vw"
                        : "(min-width: 1280px) 19vw, (min-width: 1024px) 38vw, 50vw"
                    }
                    shadow
                    // A grid, so the frame's full-size well can fill the
                    // min-height.
                    className={cn(
                      "grid min-h-[360px]",
                      speakerPortraits.length === 1 && "lg:min-h-[620px]",
                    )}
                  />
                  <figcaption className="absolute inset-x-3 bottom-3 rounded-xl bg-brand-card/95 px-4 py-3 text-brand-ink">
                    <span className="block font-semibold">
                      {entry.speaker.publicName}
                    </span>
                    {entry.speaker.occupation || entry.role ? (
                      <span className="mt-1 block text-sm text-brand-ink/75">
                        {[entry.speaker.occupation, entry.role]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : sessionArtwork ? (
            // Decorative: the title beside it already names the session.
            <ProgramArtworkFrame
              src={sessionArtwork}
              priority
              sizes="(min-width: 1024px) 38vw, 100vw"
              shadow
              className="grid min-h-[360px] lg:min-h-[620px]"
            />
          ) : null}
        </div>
      </section>

      <section>
        <div className="container mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-20 lg:px-12">
          <div>
            {session.description ? (
              <section>
                <h2 className="mb-5 font-display text-3xl font-extrabold leading-tight tracking-[-0.5px] sm:text-4xl">
                  De qué trata
                </h2>
                <p className="max-w-prose whitespace-pre-line text-lg leading-8 text-brand-ink/80">
                  {session.description}
                </p>
              </section>
            ) : null}

            {outcomes.length > 0 ? (
              <section className="mt-14">
                <h2 className="mb-5 font-display text-3xl font-extrabold leading-tight tracking-[-0.5px] sm:text-4xl">
                  Lo que vas a aprender
                </h2>
                <LearningOutcomesList outcomes={outcomes} />
              </section>
            ) : null}
          </div>

          <section id="horarios" tabIndex={-1} className="scroll-mt-28">
            <div className="rounded-2xl border border-brand-ink/10 bg-brand-card p-5 sm:p-7 lg:sticky lg:top-[calc(85px+var(--announcement-strip-height,0px)+1.5rem)]">
              <h2 className="mb-2 font-display text-2xl font-extrabold tracking-[-0.5px] sm:text-3xl">
                Elegí un horario
              </h2>
              <OccurrenceScheduleList
                occurrences={session.occurrences}
                programStatus={program?.status ?? null}
                sessionStatus={session.status}
                venuesById={venuesById}
                fallbackVenueId={fallbackVenueId}
                programSlug={program?.slug ?? null}
                sessionSlug={session.slug}
                sessionTitle={session.title}
                availabilityByOccurrence={availabilityByOccurrence}
                audience={session.audience}
                publicPrice={publicPrice}
                participantPrice={participantPrice}
                renderedAt={renderedAt}
                acceptsPromoCodes={program !== null}
              />
            </div>
          </section>
        </div>
      </section>

      {session.sessionSpeakers.length > 0 ? (
        <section className="bg-brand-coral-soft py-14 sm:py-20">
          <div className="container mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <h2 className="mb-8 font-display text-3xl font-extrabold leading-tight tracking-[-0.5px] sm:text-4xl">
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
                    className="grid grid-cols-[88px_1fr] gap-5 rounded-2xl bg-brand-card p-5 sm:grid-cols-[112px_1fr]"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-brand-lavender">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={entry.speaker.publicName}
                          fill
                          sizes="112px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center font-display text-4xl font-extrabold text-brand-primary">
                          {entry.speaker.publicName.slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold">
                        {entry.speaker.publicName}
                      </h3>
                      {entry.speaker.occupation || entry.role ? (
                        <p className="mt-1 text-sm text-brand-ink/75">
                          {[entry.speaker.occupation, entry.role]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {entry.speaker.bio ? (
                        <p className="mt-3 text-sm leading-6 text-brand-ink/80">
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
