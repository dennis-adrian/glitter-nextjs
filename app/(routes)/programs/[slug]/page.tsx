import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ProgramAgendaDay from "@/app/components/programs/program-agenda-day";
import ProgramAgendaEntry from "@/app/components/programs/program-agenda-entry";
import ProgramHero from "@/app/components/programs/program-hero";
import ProgramViewTracker from "@/app/components/programs/program-view-tracker";
import SmoothScrollLink from "@/app/components/programs/smooth-scroll-link";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { formatDate } from "@/app/lib/formatters";
import { resolveProgramArtwork } from "@/app/lib/programs/artwork";
import {
  fetchProgramSettings,
  fetchPublishedProgramBySlug,
  fetchPublishedProgramRouteParams,
  fetchVenues,
} from "@/app/lib/programs/data";
import type {
  SessionOccurrence,
  SessionWithOccurrences,
} from "@/app/lib/programs/definitions";
import { sessionPath } from "@/app/lib/programs/paths";
import {
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
} from "@/app/lib/programs/pricing";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-static";
export const revalidate = 60;

const AGENDA_ID = "programa";

type AgendaEntry = {
  session: SessionWithOccurrences;
  occurrence: SessionOccurrence;
};

type AgendaDay = {
  key: string;
  date: Date;
  entries: AgendaEntry[];
};

export async function generateStaticParams() {
  return fetchPublishedProgramRouteParams();
}

function buildAgendaDays(sessions: SessionWithOccurrences[]): AgendaDay[] {
  const entries = sessions
    .flatMap((session) =>
      session.occurrences.map((occurrence) => ({ session, occurrence })),
    )
    .sort(
      (a, b) =>
        a.occurrence.startsAt.getTime() - b.occurrence.startsAt.getTime(),
    );

  const days = new Map<string, AgendaDay>();

  for (const entry of entries) {
    const key =
      formatDate(entry.occurrence.startsAt).toISODate() ??
      entry.occurrence.startsAt.toISOString().slice(0, 10);
    const existing = days.get(key);

    if (existing) {
      existing.entries.push(entry);
    } else {
      days.set(key, {
        key,
        date: entry.occurrence.startsAt,
        entries: [entry],
      });
    }
  }

  return [...days.values()];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const program = await fetchPublishedProgramBySlug(slug);

  if (!program) return { title: "Programa" };

  return {
    title: program.name,
    description: program.summary ?? undefined,
    openGraph: {
      title: program.name,
      description: program.summary ?? undefined,
      images: [resolveProgramArtwork(program.bannerUrl)],
    },
  };
}

export default async function ProgramPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs", null);

  const { slug } = await params;
  const [program, settings, venues] = await Promise.all([
    fetchPublishedProgramBySlug(slug),
    fetchProgramSettings(),
    fetchVenues(),
  ]);

  if (!program) notFound();

  // Resolved by id rather than by comparing against the session and program
  // venues: an occurrence may point at a third venue that is neither, and
  // matching pairwise showed no location at all for exactly that case.
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));

  const agendaDays = buildAgendaDays(program.sessions);
  const programDiscount = programDiscountFrom(program);
  const globalDiscount = globalDiscountFrom(settings);

  return (
    // overflow-x-clip, not overflow-hidden: clipping does not create a scroll
    // container, so the sticky day nav keeps working.
    <div className="overflow-x-clip bg-brand-elevated text-brand-ink">
      <ProgramViewTracker
        event={POSTHOG_EVENTS.PROGRAM_VIEWED}
        properties={{
          program_slug: program.slug,
          program_name: program.name,
          program_status: program.status,
          session_count: program.sessions.length,
          day_count: agendaDays.length,
        }}
      />
      <ProgramHero
        name={program.name}
        summary={program.summary}
        startDate={program.startDate}
        endDate={program.endDate}
        bannerUrl={program.bannerUrl}
        sessionCount={program.sessions.length}
        dayCount={agendaDays.length}
        agendaId={AGENDA_ID}
      />

      <section
        id={AGENDA_ID}
        tabIndex={-1}
        className="scroll-mt-20 py-14 sm:py-20"
      >
        <div className="container mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="mb-8 max-w-3xl">
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-[-0.5px] sm:text-4xl">
              Arma tu ruta de aprendizaje
            </h2>
          </div>

          {agendaDays.length === 0 ? (
            <p className="rounded-2xl border border-brand-ink/10 bg-brand-card p-7 font-medium text-brand-ink/75">
              Los horarios aparecerán aquí muy pronto.
            </p>
          ) : (
            <>
              <nav
                aria-label="Días del programa"
                className="no-scrollbar sticky top-[calc(77px+var(--announcement-strip-height,0px))] z-20 -mx-5 mb-8 flex gap-2 overflow-x-auto border-b border-brand-ink/10 bg-brand-elevated/95 px-5 py-3 backdrop-blur sm:-mx-1 sm:px-1 lg:top-[calc(85px+var(--announcement-strip-height,0px))]"
              >
                {agendaDays.map((day, index) => (
                  <SmoothScrollLink
                    key={day.key}
                    targetId={`dia-${day.key}`}
                    className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-brand-ink/15 bg-brand-card px-4 text-sm font-semibold tabular-nums transition-colors hover:bg-brand-lavender focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  >
                    Día {index + 1} · {formatDate(day.date).toFormat("ccc dd")}
                  </SmoothScrollLink>
                ))}
              </nav>

              <div className="space-y-7">
                {agendaDays.map((day, dayIndex) => (
                  <ProgramAgendaDay
                    key={day.key}
                    id={`dia-${day.key}`}
                    date={day.date}
                    dayNumber={dayIndex + 1}
                  >
                    {day.entries.map(({ session, occurrence }) => {
                      const venueId =
                        occurrence.venueId ??
                        session.venueId ??
                        program.defaultVenueId ??
                        null;
                      const venue =
                        venueId === null
                          ? null
                          : (venuesById.get(venueId) ?? null);
                      const priceInput = {
                        publicPrice: session.publicPrice,
                        participantPrice: session.participantPrice,
                        programDiscount,
                        globalDiscount,
                      };

                      return (
                        <ProgramAgendaEntry
                          key={occurrence.id}
                          session={session}
                          startsAt={occurrence.startsAt}
                          href={sessionPath({ slug: session.slug, program })}
                          venueName={venue?.name ?? null}
                          publicPrice={
                            resolvePrice(priceInput, "public").amount
                          }
                          participantPrice={
                            resolvePrice(priceInput, "active_participant")
                              .amount
                          }
                        />
                      );
                    })}
                  </ProgramAgendaDay>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
