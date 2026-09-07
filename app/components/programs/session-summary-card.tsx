import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { formatDate } from "@/app/lib/formatters";
import { cn } from "@/app/lib/utils";
import {
  SESSION_TYPE_LABELS,
  type SessionOccurrence,
  type SessionWithOccurrences,
} from "@/app/lib/programs/definitions";
import {
  formatMoney,
  resolvePrice,
  type ParticipantDiscount,
} from "@/app/lib/programs/pricing";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import type { ProgramStatus } from "@/app/lib/programs/definitions";
import { citrusGothicSolid } from "@/app/ui/fonts";
import { DateTime } from "luxon";

type Props = {
  session: SessionWithOccurrences;
  programSlug: string;
  programStatus: ProgramStatus;
  programDiscount: ParticipantDiscount | null;
  globalDiscount: ParticipantDiscount;
  featured?: boolean;
  className?: string;
};

/**
 * The occurrence the card speaks for: the earliest one still ahead, ignoring
 * cancelled and completed ones. Once every occurrence is behind us the last one
 * stands in, so a finished session still shows a date and its final state.
 *
 * Relies on `occurrences` arriving ordered by `startsAt` (see `data.ts`).
 */
function pickNextOccurrence(
  occurrences: SessionOccurrence[],
): SessionOccurrence | undefined {
  const now = Date.now();

  const upcoming = occurrences.find(
    (occurrence) =>
      occurrence.lifecycleStatus === "scheduled" &&
      occurrence.startsAt.getTime() >= now,
  );

  return upcoming ?? occurrences.at(-1);
}

/**
 * One session on the public program page. Shows the next occurrence's schedule
 * and state; the session page lists them all.
 */
export default function SessionSummaryCard({
  session,
  programSlug,
  programStatus,
  programDiscount,
  globalDiscount,
  featured = false,
  className,
}: Props) {
  const nextOccurrence = pickNextOccurrence(session.occurrences);

  const priceInput = {
    publicPrice: session.publicPrice,
    participantPrice: session.participantPrice,
    programDiscount,
    globalDiscount,
  };
  const publicPrice = resolvePrice(priceInput, "public").amount;
  const participantPrice = resolvePrice(
    priceInput,
    "active_participant",
  ).amount;

  const resolvedState = nextOccurrence
    ? resolveOccurrenceState({
        programStatus,
        sessionStatus: session.status,
        lifecycleStatus: nextOccurrence.lifecycleStatus,
        salesStartAt: nextOccurrence.salesStartAt,
        salesEndAt: nextOccurrence.salesEndAt,
        salesClosedAt: nextOccurrence.salesClosedAt,
        rescheduledAt: nextOccurrence.rescheduledAt,
      })
    : null;

  const speakerNames = session.sessionSpeakers
    .map((entry) => entry.speaker.publicName)
    .join(", ");
  const speakerPortrait = session.sessionSpeakers.find(
    (entry) => entry.speaker.imageUrl,
  );
  const sessionHref = `/programs/${programSlug}/${session.slug}`;
  const isTalk = session.type === "talk";

  return (
    <article
      className={cn(
        "group relative isolate flex h-full flex-col overflow-hidden rounded-4xl transition-transform duration-300 hover:-translate-y-1",
        isTalk ? "bg-[#ffbe57] text-[#4b255f]" : "bg-[#9347f5] text-[#fffaf3]",
        className,
      )}
    >
      <Link
        href={sessionHref}
        aria-label={`Ver ${session.title}`}
        className={cn(
          "relative m-3 mb-0 block overflow-hidden rounded-[1.4rem] bg-[#d9f7f5]",
          featured ? "aspect-5/4 lg:aspect-video" : "aspect-4/3",
        )}
      >
        {speakerPortrait?.speaker.imageUrl ? (
          <Image
            src={speakerPortrait.speaker.imageUrl}
            alt={speakerPortrait.speaker.publicName}
            fill
            sizes={
              featured
                ? "(min-width: 1024px) 58vw, 100vw"
                : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            }
            className="object-cover object-top transition duration-500 ease-out group-hover:scale-[1.035]"
          />
        ) : (
          <span className="absolute inset-0 flex flex-col justify-end bg-[#dff8f4] p-6 text-[#4b255f]">
            <span
              className={`${citrusGothicSolid.className} text-5xl uppercase leading-none sm:text-6xl`}
            >
              {SESSION_TYPE_LABELS[session.type]}
            </span>
            {session.topic ? (
              <span className="mt-3 text-xs font-black uppercase tracking-[0.14em]">
                {session.topic}
              </span>
            ) : null}
          </span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-[#fffaf3] px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#4b255f]">
          {SESSION_TYPE_LABELS[session.type]}
        </span>
        <span className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-[#fffaf3] text-[#4b255f] transition-transform duration-300 group-hover:rotate-6">
          <ArrowUpRightIcon className="size-5" aria-hidden="true" />
        </span>
      </Link>

      <div className={cn("flex flex-1 flex-col p-5", featured && "lg:p-7")}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {nextOccurrence ? (
            <span
              className={cn(
                "text-xs font-black uppercase tracking-[0.16em]",
                session.type === "talk" ? "text-[#7b3b76]" : "text-[#e5d5ff]",
              )}
            >
              {formatDate(nextOccurrence.startsAt).toLocaleString({
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
            </span>
          ) : null}
          {resolvedState ? (
            <ProgramStatusBadge
              state={resolvedState.state}
              wasRescheduled={resolvedState.wasRescheduled}
            />
          ) : null}
        </div>

        <h3
          className={cn(
            citrusGothicSolid.className,
            "text-balance text-3xl uppercase leading-[0.98] sm:text-4xl",
            featured && "lg:text-5xl",
          )}
        >
          <Link
            href={sessionHref}
            className="decoration-current decoration-2 underline-offset-4 hover:underline"
          >
            {session.title}
          </Link>
        </h3>

        {speakerNames ? (
          <p
            className={cn(
              "mt-3 text-sm font-semibold",
              isTalk ? "text-[#663c67]" : "text-[#eee4ff]",
            )}
          >
            Con {speakerNames}
          </p>
        ) : null}

        <div
          className={cn(
            "mt-auto flex items-end justify-between gap-4 border-t pt-5",
            isTalk ? "border-[#4b255f]/25" : "border-white/35",
          )}
        >
          <div>
            {nextOccurrence ? (
              <p className="text-sm font-semibold">
                {formatDate(nextOccurrence.startsAt).toLocaleString(
                  DateTime.TIME_SIMPLE,
                )}
              </p>
            ) : null}
            <p
              className={cn(
                "mt-0.5 text-xs font-bold uppercase tracking-[0.12em]",
                isTalk ? "text-[#663c67]" : "text-[#ded1ff]",
              )}
            >
              {session.topic ?? "Ilustración"}
            </p>
          </div>
          <p className="text-right text-sm">
            {participantPrice !== publicPrice ? (
              <>
                <span className="block text-xs line-through opacity-65">
                  {formatMoney(publicPrice)}
                </span>
                <span className="block font-black">
                  {formatMoney(participantPrice)} participantes
                </span>
              </>
            ) : (
              <span className="block font-black">
                {formatMoney(publicPrice)}
              </span>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}
