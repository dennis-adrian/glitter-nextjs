import {
  ArrowDownIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  Clock3Icon,
  MapPinIcon,
  PencilLineIcon,
  SparklesIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import GlitterWeekLockup from "@/app/components/programs/glitter-week-lockup";
import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import SessionSummaryCard from "@/app/components/programs/session-summary-card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { formatDate } from "@/app/lib/formatters";
import { DEFAULT_PROGRAM_ARTWORK } from "@/app/lib/programs/artwork";
import {
  fetchProgramSettings,
  fetchPublishedProgramBySlug,
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
import { resolveOccurrenceState } from "@/app/lib/programs/state";
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
      images: [program.bannerUrl ?? DEFAULT_PROGRAM_ARTWORK],
    },
  };
}

export default async function ProgramPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs");

  const { slug } = await params;
  const [program, settings] = await Promise.all([
    fetchPublishedProgramBySlug(slug),
    fetchProgramSettings(),
  ]);

  if (!program) notFound();

  const dateRange = [program.startDate, program.endDate]
    .filter((date): date is Date => date !== null)
    .map((date) => formatDate(date).toLocaleString(DateTime.DATE_MED))
    .join(" — ");
  const agendaDays = buildAgendaDays(program.sessions);
  const artwork = program.bannerUrl ?? DEFAULT_PROGRAM_ARTWORK;
  const programDiscount = programDiscountFrom(program);
  const globalDiscount = globalDiscountFrom(settings);

  return (
    <div className="overflow-hidden bg-[#fffaf3] text-[#4b255f]">
      <section className="grid border-b border-[#4b255f]/10 lg:min-h-[720px] lg:grid-cols-[0.92fr_1.08fr]">
        <div className="relative z-10 flex flex-col justify-center overflow-hidden bg-[#9347f5] px-5 py-14 text-[#fffaf3] sm:px-10 sm:py-20 lg:px-[max(4rem,8vw)]">
          <div
            aria-hidden="true"
            className="absolute -left-16 -top-20 size-64 rounded-full bg-[#ffc1fd]/35 blur-sm"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 right-[-4rem] size-72 rounded-full bg-[#6fe7e9]/25"
          />

          <div className="relative max-w-xl">
            <p className="mb-7 inline-flex items-center gap-2 rounded-full bg-[#fffaf3] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#4b255f]">
              <BookOpenIcon className="size-4" aria-hidden="true" />
              Aula abierta de ilustración
            </p>

            <h1 className="sr-only">{program.name}</h1>
            <GlitterWeekLockup />

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
              <Link
                href="#programa"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#ffbe57] px-6 text-sm font-black uppercase tracking-[0.08em] text-[#4b255f] transition hover:-translate-y-0.5 hover:bg-[#ffd477] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
              >
                Explorar el programa
                <ArrowDownIcon className="size-4" aria-hidden="true" />
              </Link>
              <span className="rounded-full border border-white/55 px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">
                {program.sessions.length} sesiones · {agendaDays.length}{" "}
                {agendaDays.length === 1 ? "día" : "días"}
              </span>
            </div>
          </div>
        </div>

        <div className="relative min-h-[440px] overflow-hidden bg-[#72e5e7] sm:min-h-[560px] lg:min-h-full">
          <Image
            src={artwork}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-center"
          />
          <span className="absolute bottom-5 right-5 max-w-[16rem] rotate-[-2deg] rounded-[1.5rem_1.5rem_0.4rem_1.5rem] bg-[#fffaf3] px-4 py-3 text-xs font-black uppercase leading-snug tracking-[0.11em] text-[#4b255f] sm:bottom-8 sm:right-8">
            Preguntar · probar · volver a dibujar
          </span>
        </div>
      </section>

      <div
        aria-hidden="true"
        className="overflow-hidden bg-[#ffbe57] px-4 py-4 text-center text-xs font-black uppercase tracking-[0.18em] text-[#4b255f] sm:text-sm"
      >
        Mirar · imaginar · dibujar · conversar · experimentar · compartir
      </div>

      <section className="bg-[#fffaf3]">
        <div className="container mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:gap-20 lg:px-12">
          <div>
            <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#9347f5]">
              Aprender haciendo
            </p>
            <h2
              className={`${citrusGothicSolid.className} max-w-[15ch] text-balance text-5xl uppercase leading-[0.92] text-[#4b255f] sm:text-7xl`}
            >
              Una semana para encontrar nuevas maneras de mirar.
            </h2>

            <div className="mt-10 grid grid-cols-3 gap-3">
              {[
                {
                  label: "Mirar",
                  color: "bg-[#72e5e7]",
                  Icon: PencilLineIcon,
                },
                {
                  label: "Hacer",
                  color: "bg-[#ffbe57]",
                  Icon: SparklesIcon,
                },
                {
                  label: "Compartir",
                  color: "bg-[#f7aee8]",
                  Icon: BookOpenIcon,
                },
              ].map(({ label, color, Icon }) => (
                <div
                  key={label}
                  className={`flex min-h-28 flex-col justify-between rounded-[1.6rem] p-4 ${color}`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  <span className="text-sm font-black uppercase tracking-[0.08em]">
                    {label as string}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <div className="rounded-[2.2rem_2.2rem_2.2rem_0.7rem] bg-[#f3e9ff] p-7 sm:p-9">
              <p className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-[#9347f5]">
                Sobre el programa
              </p>
              <p className="whitespace-pre-line text-base font-medium leading-relaxed text-[#644868] sm:text-lg">
                {program.description ??
                  "Charlas y talleres que convierten procesos creativos en experiencias para observar, preguntar y practicar en comunidad."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#dff8f4] py-16 sm:py-24">
        <div className="container mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#e639b5]">
                Elige por dónde empezar
              </p>
              <h2
                className={`${citrusGothicSolid.className} text-5xl uppercase leading-none text-[#4b255f] sm:text-7xl`}
              >
                Sesiones
              </h2>
            </div>
            <p className="max-w-sm text-sm font-semibold leading-relaxed text-[#70566f]">
              Cada sesión es una puerta distinta: escucha un proceso, prueba una
              técnica o conoce otra forma de trabajar.
            </p>
          </div>

          {program.sessions.length === 0 ? (
            <div className="rounded-[2rem] bg-white p-10 text-center font-bold">
              Todavía no hay sesiones publicadas.
            </div>
          ) : (
            <div className="grid gap-7 md:grid-cols-12">
              {program.sessions.map((session, index) => (
                <SessionSummaryCard
                  key={session.id}
                  session={session}
                  programSlug={program.slug}
                  programStatus={program.status}
                  programDiscount={programDiscount}
                  globalDiscount={globalDiscount}
                  featured={index === 0}
                  className={
                    index === 0
                      ? "md:col-span-7"
                      : index === 1
                        ? "md:col-span-5"
                        : "md:col-span-6 lg:col-span-4"
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section
        id="programa"
        className="scroll-mt-20 bg-[#ffc1fd] py-16 text-[#4b255f] sm:py-24"
      >
        <div className="container mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="mb-8 max-w-3xl text-[#4b255f]">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#9347f5]">
              Día por día
            </p>
            <h2
              className={`${citrusGothicSolid.className} text-balance text-5xl uppercase leading-[0.9] sm:text-7xl`}
            >
              Arma tu ruta de aprendizaje
            </h2>
          </div>

          {agendaDays.length === 0 ? (
            <p className="rounded-[2rem] bg-[#fffaf3] p-7 font-semibold">
              Los horarios aparecerán aquí muy pronto.
            </p>
          ) : (
            <>
              <nav
                aria-label="Días del programa"
                className="no-scrollbar sticky top-16 z-20 -mx-5 mb-8 flex gap-2 overflow-x-auto bg-[#ffc1fd]/95 px-5 py-3 backdrop-blur md:top-20 sm:mx-0 sm:px-0"
              >
                {agendaDays.map((day, index) => (
                  <Link
                    key={day.key}
                    href={`#dia-${day.key}`}
                    className="shrink-0 rounded-full bg-[#fffaf3] px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition hover:bg-[#ffbe57]"
                  >
                    Día {index + 1} · {formatDate(day.date).toFormat("ccc dd")}
                  </Link>
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
                      <span
                        className={`${citrusGothicSolid.className} text-6xl leading-none text-[#ffbe57] sm:text-7xl`}
                      >
                        {formatDate(day.date).toFormat("dd")}
                      </span>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.15em] text-[#e5d5ff]">
                          Día {dayIndex + 1}
                        </p>
                        <h3 className="text-xl font-black capitalize sm:text-2xl">
                          {formatDate(day.date).toFormat("cccc, LLLL")}
                        </h3>
                      </div>
                    </div>

                    <ol className="px-6 sm:px-8">
                      {day.entries.map(({ session, occurrence }) => {
                        const venue =
                          occurrence.venueId === null
                            ? (session.venue ?? program.defaultVenue)
                            : occurrence.venueId === session.venueId
                              ? session.venue
                              : occurrence.venueId === program.defaultVenueId
                                ? program.defaultVenue
                                : null;
                        const price = resolvePrice(
                          {
                            publicPrice: session.publicPrice,
                            participantPrice: session.participantPrice,
                            programDiscount,
                            globalDiscount,
                          },
                          "public",
                        ).amount;
                        const resolved = resolveOccurrenceState({
                          programStatus: program.status,
                          sessionStatus: session.status,
                          lifecycleStatus: occurrence.lifecycleStatus,
                          salesStartAt: occurrence.salesStartAt,
                          salesEndAt: occurrence.salesEndAt,
                          salesClosedAt: occurrence.salesClosedAt,
                          rescheduledAt: occurrence.rescheduledAt,
                        });

                        return (
                          <li
                            key={occurrence.id}
                            className="group grid gap-4 border-b border-[#4b255f]/15 py-6 last:border-b-0 sm:grid-cols-[100px_1fr_auto] sm:items-center"
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

                            <div>
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
                            </div>

                            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                              <span className="font-black">
                                {formatMoney(price)}
                              </span>
                              <ProgramStatusBadge
                                state={resolved.state}
                                wasRescheduled={resolved.wasRescheduled}
                              />
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
