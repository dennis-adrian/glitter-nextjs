import {
  ArrowDownIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  Clock3Icon,
  MapPinIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import GlitterWeekLockup from "@/app/components/programs/glitter-week-lockup";
import SmoothScrollLink from "@/app/components/programs/smooth-scroll-link";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { formatDate } from "@/app/lib/formatters";
import { resolveProgramArtwork } from "@/app/lib/programs/artwork";
import {
  fetchProgramSettings,
  fetchPublishedProgramBySlug,
  fetchVenues,
} from "@/app/lib/programs/data";
import {
  SESSION_TYPE_LABELS,
  type SessionOccurrence,
  type SessionWithOccurrences,
} from "@/app/lib/programs/definitions";
import {
  formatMoney,
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
} from "@/app/lib/programs/pricing";
import { citrusGothicSolid } from "@/app/ui/fonts";

type Props = {
  params: Promise<{ slug: string }>;
};

type AgendaEntry = {
  session: SessionWithOccurrences;
  occurrence: SessionOccurrence;
};

type AgendaDay = {
  key: string;
  date: Date;
  entries: AgendaEntry[];
};

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

function formatAgendaWeekday(date: Date): string {
  const weekday = formatDate(date).toFormat("cccc");
  return weekday.charAt(0).toLocaleUpperCase("es-BO") + weekday.slice(1);
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
  await requireFeatureEnabled("paid_programs");

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

  const dateRange = [program.startDate, program.endDate]
    .filter((date): date is Date => date !== null)
    .map((date) => formatDate(date).toLocaleString(DateTime.DATE_MED))
    .join(" al ");
  const agendaDays = buildAgendaDays(program.sessions);
  const artwork = resolveProgramArtwork(program.bannerUrl);
  const programDiscount = programDiscountFrom(program);
  const globalDiscount = globalDiscountFrom(settings);

  return (
    <div className="overflow-hidden bg-[#fffaf3] text-[#4b255f]">
      <section className="grid border-b border-[#4b255f]/10 lg:min-h-180 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="relative z-10 flex flex-col justify-center overflow-hidden bg-[#9347f5] px-5 py-14 text-[#fffaf3] sm:px-10 sm:py-20 lg:px-[max(4rem,8vw)]">
          <div
            aria-hidden="true"
            className="absolute -left-16 -top-20 size-64 rounded-full bg-[#ffc1fd]/35 blur-sm"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -right-16 size-72 rounded-full bg-[#6fe7e9]/25"
          />

          <div className="relative max-w-xl">
            <h1 className="sr-only">{program.name}</h1>
            <GlitterWeekLockup title={program.name} />

            <div className="mt-8 max-w-lg">
              {dateRange ? (
                <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#dff8f4]">
                  <CalendarDaysIcon className="size-4" aria-hidden="true" />
                  {dateRange}
                </p>
              ) : null}
              <p className="text-balance text-lg font-bold leading-snug sm:text-xl">
                {program.summary ??
                  "Una semana para aprender, practicar y compartir nuevas formas de hacer ilustración."}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <SmoothScrollLink
                targetId="programa"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#ffbe57] px-6 text-sm font-black uppercase tracking-[0.08em] text-[#4b255f] transition hover:-translate-y-0.5 hover:bg-[#ffd477] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
              >
                Explorar el programa
                <ArrowDownIcon className="size-4" aria-hidden="true" />
              </SmoothScrollLink>
              <span className="rounded-full border border-white/55 px-5 py-3 text-xs font-black uppercase tracking-widest">
                {program.sessions.length}{" "}
                {program.sessions.length === 1 ? "sesión" : "sesiones"} ·{" "}
                {agendaDays.length} {agendaDays.length === 1 ? "día" : "días"}
              </span>
            </div>
          </div>
        </div>

        <div className="relative min-h-110 overflow-hidden bg-[#72e5e7] sm:min-h-140 lg:min-h-full">
          <Image
            src={artwork}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-top-right"
          />
        </div>
      </section>

      <section
        id="programa"
        className="scroll-mt-20 bg-[#ffc1fd] py-16 text-[#4b255f] sm:py-24"
      >
        <div className="container mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="mb-8 max-w-3xl text-[#4b255f]">
            <h2
              className={`${citrusGothicSolid.className} text-balance text-5xl uppercase leading-[0.9] sm:text-7xl`}
            >
              Arma tu ruta de aprendizaje
            </h2>
          </div>

          {agendaDays.length === 0 ? (
            <p className="rounded-4xl bg-[#fffaf3] p-7 font-semibold">
              Los horarios aparecerán aquí muy pronto.
            </p>
          ) : (
            <>
              <nav
                aria-label="Días del programa"
                className="no-scrollbar sticky top-16 z-20 -mx-5 mb-8 flex gap-2 overflow-x-auto bg-[#ffc1fd]/95 px-5 py-3 backdrop-blur md:top-20 sm:mx-0 sm:px-0"
              >
                {agendaDays.map((day, index) => (
                  <SmoothScrollLink
                    key={day.key}
                    targetId={`dia-${day.key}`}
                    className="shrink-0 rounded-full bg-[#fffaf3] px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition hover:bg-[#ffbe57]"
                  >
                    Día {index + 1} · {formatDate(day.date).toFormat("ccc dd")}
                  </SmoothScrollLink>
                ))}
              </nav>

              <div className="space-y-7">
                {agendaDays.map((day, dayIndex) => (
                  <section
                    key={day.key}
                    id={`dia-${day.key}`}
                    className="scroll-mt-36 overflow-hidden rounded-[2.4rem] bg-[#fffaf3]"
                  >
                    <div className="flex items-center gap-5 bg-[#9347f5] px-6 py-6 text-white sm:px-8">
                      <div className="grid shrink-0 justify-items-center">
                        <span
                          className={`${citrusGothicSolid.className} text-6xl leading-none text-[#ffbe57] sm:text-7xl`}
                        >
                          {formatDate(day.date).toFormat("dd")}
                        </span>
                        <span className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#e5d5ff]">
                          {formatDate(day.date).toFormat("LLLL")}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.15em] text-[#e5d5ff]">
                          Día {dayIndex + 1}
                        </p>
                        <h3 className="text-xl font-black sm:text-2xl">
                          {formatAgendaWeekday(day.date)}
                        </h3>
                      </div>
                    </div>

                    <ol className="px-6 sm:px-8">
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
                        const price = resolvePrice(
                          {
                            publicPrice: session.publicPrice,
                            participantPrice: session.participantPrice,
                            programDiscount,
                            globalDiscount,
                          },
                          "public",
                        ).amount;

                        return (
                          <li
                            key={occurrence.id}
                            className="group grid gap-5 border-b border-[#4b255f]/15 py-7 last:border-b-0 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-start"
                          >
                            <div>
                              <p className="flex items-center gap-2 text-lg font-black text-[#9347f5]">
                                <Clock3Icon className="size-4" />
                                {formatDate(occurrence.startsAt).toLocaleString(
                                  DateTime.TIME_SIMPLE,
                                )}
                              </p>
                              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#8a6d89]">
                                {SESSION_TYPE_LABELS[session.type]}
                              </p>
                            </div>

                            <div className="min-w-0">
                              <Link
                                href={`/programs/${program.slug}/${session.slug}`}
                                className="inline-flex items-start gap-2 text-balance text-xl font-black leading-tight decoration-[#9347f5] decoration-2 underline-offset-4 hover:underline sm:text-2xl"
                              >
                                {session.title}
                                <ArrowUpRightIcon className="mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                              </Link>
                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#70566f]">
                                {session.sessionSpeakers.length > 0 ? (
                                  <span>
                                    {session.sessionSpeakers
                                      .map((entry) => entry.speaker.publicName)
                                      .join(", ")}
                                  </span>
                                ) : null}
                                {venue ? (
                                  <span className="flex items-center gap-1">
                                    <MapPinIcon className="size-3.5" />
                                    {venue.name}
                                  </span>
                                ) : null}
                              </div>

                              {session.description ? (
                                <p className="mt-4 max-w-3xl whitespace-pre-line text-sm font-medium leading-relaxed text-[#5f455f] sm:text-base">
                                  {session.description}
                                </p>
                              ) : null}

                              {session.learningOutcomes &&
                              session.learningOutcomes.length > 0 ? (
                                <div className="mt-5 rounded-2xl bg-[#ffc1fd]/35 px-4 py-4">
                                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#9347f5]">
                                    Lo que aprenderás
                                  </p>
                                  <ul className="mt-3 grid gap-2.5 lg:grid-cols-2">
                                    {session.learningOutcomes.map(
                                      (outcome, index) => (
                                        <li
                                          key={`${session.id}-outcome-${index}`}
                                          className="flex items-start gap-2 text-sm font-semibold leading-snug text-[#4b255f]"
                                        >
                                          <span
                                            aria-hidden="true"
                                            className="mt-1.5 size-2 shrink-0 rotate-45 rounded-[2px] bg-[#ffbe57]"
                                          />
                                          <span>{outcome}</span>
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              ) : null}
                            </div>

                            <div className="text-right">
                              <span className="font-black">
                                {formatMoney(price)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
