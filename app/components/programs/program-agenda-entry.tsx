import { ArrowUpRightIcon, Clock3Icon, MapPinIcon } from "lucide-react";
import { DateTime } from "luxon";
import Image from "next/image";
import Link from "next/link";

import LearningOutcomesList from "@/app/components/programs/learning-outcomes-list";
import SessionTypePill from "@/app/components/programs/session-type-pill";
import ViewerSessionPrice from "@/app/components/programs/viewer-session-price";
import { formatDisplayDate } from "@/app/lib/formatters";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import type { SessionWithOccurrences } from "@/app/lib/programs/definitions";

type ProgramAgendaEntryProps = {
  session: SessionWithOccurrences;
  startsAt: Date;
  href: string;
  venueName: string | null;
  publicPrice: number;
  participantPrice: number;
};

/** One occurrence in a program agenda day. */
export default function ProgramAgendaEntry({
  session,
  startsAt,
  href,
  venueName,
  publicPrice,
  participantPrice,
}: ProgramAgendaEntryProps) {
  const speakerPortrait = session.sessionSpeakers.find((entry) =>
    isAllowedProgramArtworkUrl(entry.speaker.imageUrl),
  );
  const speaker =
    speakerPortrait?.speaker ?? session.sessionSpeakers[0]?.speaker;

  return (
    <li className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-5 border-b border-brand-border py-7 last:border-b-0 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-stretch sm:gap-5">
      <div className="col-start-1 row-start-1 flex items-center gap-3 sm:block">
        <p className="flex items-center gap-2 text-lg font-semibold tabular-nums text-brand-ink">
          <Clock3Icon
            className="size-4 text-brand-primary"
            aria-hidden="true"
          />
          {formatDisplayDate(startsAt, DateTime.TIME_SIMPLE)}
        </p>
        <SessionTypePill type={session.type} className="sm:mt-2" />
      </div>

      <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <Link
          href={href}
          className="inline-flex items-start gap-2 text-balance font-display text-xl font-bold leading-tight underline decoration-brand-primary decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary sm:text-2xl [@media(hover:hover)]:no-underline [@media(hover:hover)]:hover:underline"
        >
          {session.title}
          <ArrowUpRightIcon
            className="mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
            aria-hidden="true"
          />
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brand-ink/75">
          {session.sessionSpeakers.length > 0 ? (
            <span>
              {session.sessionSpeakers
                .map((entry) => entry.speaker.publicName)
                .join(", ")}
            </span>
          ) : null}
          {venueName ? (
            <span className="flex items-center gap-1">
              <MapPinIcon className="size-3.5" aria-hidden="true" />
              {venueName}
            </span>
          ) : null}
        </div>

        {session.description ? (
          <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-brand-ink/80 sm:text-base">
            {session.description}
          </p>
        ) : null}

        {session.learningOutcomes && session.learningOutcomes.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-semibold">Lo que aprenderás</p>
            <LearningOutcomesList
              outcomes={session.learningOutcomes}
              compact
              className="mt-3"
            />
          </div>
        ) : null}
      </div>

      <div className="contents sm:col-start-3 sm:row-start-1 sm:flex sm:h-full sm:flex-col sm:items-end sm:justify-between">
        {speaker ? (
          <div
            className="col-start-2 row-start-1 size-14 self-start overflow-hidden rounded-full bg-brand-lavender ring-2 ring-brand-card sm:size-16"
            title={speaker.publicName}
          >
            {speakerPortrait?.speaker.imageUrl ? (
              <Image
                src={speakerPortrait.speaker.imageUrl}
                alt={speakerPortrait.speaker.publicName}
                width={64}
                height={64}
                sizes="64px"
                className="size-full object-cover object-top"
              />
            ) : (
              <span
                aria-label={speaker.publicName}
                className="grid size-full place-items-center font-display text-xl font-extrabold text-brand-primary"
              >
                {speaker.publicName
                  .trim()
                  .slice(0, 1)
                  .toLocaleUpperCase("es-BO")}
              </span>
            )}
          </div>
        ) : null}

        <span className="col-start-2 row-start-3 self-end text-right font-semibold tabular-nums sm:mt-6">
          <ViewerSessionPrice
            publicPrice={publicPrice}
            participantPrice={participantPrice}
          />
        </span>
      </div>
    </li>
  );
}
