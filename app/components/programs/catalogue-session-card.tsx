import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import ProgramDateStamp from "@/app/components/programs/program-date-stamp";
import ViewerSessionPrice from "@/app/components/programs/viewer-session-price";
import { Card } from "@/app/components/ui/card";
import {
  countOtherUpcomingOccurrences,
  pickSessionArtwork,
  resolveSessionContext,
} from "@/app/lib/programs/catalogue-view";
import type { CatalogueSession } from "@/app/lib/programs/data";
import { SESSION_TYPE_LABELS } from "@/app/lib/programs/definitions";
import { sessionPath } from "@/app/lib/programs/paths";
import {
  programDiscountFrom,
  resolvePrice,
  type ParticipantDiscount,
} from "@/app/lib/programs/pricing";
import { cn } from "@/app/lib/utils";

type Props = {
  session: CatalogueSession;
  /** The occurrence the card speaks for, picked by `buildCatalogue`. */
  nextOccurrence: { startsAt: Date };
  globalDiscount: ParticipantDiscount;
  now: Date;
};

/**
 * One upcoming session in the public catalogue, program session or standalone.
 * Shows its next date only; the session page lists them all.
 */
export default function CatalogueSessionCard({
  session,
  nextOccurrence,
  globalDiscount,
  now,
}: Props) {
  const href = sessionPath(session);
  const artwork = pickSessionArtwork(session);
  const context = resolveSessionContext(session);
  const otherDates = countOtherUpcomingOccurrences(session.occurrences, now);

  const priceInput = {
    publicPrice: session.publicPrice,
    participantPrice: session.participantPrice,
    programDiscount: programDiscountFrom(session.program),
    globalDiscount,
  };
  const publicPrice = resolvePrice(priceInput, "public").amount;
  const participantPrice = resolvePrice(
    priceInput,
    "active_participant",
  ).amount;

  const speakerNames = session.sessionSpeakers
    .map((entry) => entry.speaker.publicName)
    .join(", ");

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-brand-card text-brand-ink shadow-none transition-colors hover:border-brand-primary/35">
      {artwork ? (
        <div className="relative m-2 mb-0 aspect-4/3 overflow-hidden rounded-xl bg-brand-lavender">
          {/* Decorative: the speaker's name is in the text below. */}
          <Image
            src={artwork.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className={cn(
              "object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.02]",
              artwork.kind === "speaker" && "object-top",
            )}
          />
          <span
            aria-hidden="true"
            className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-brand-card text-brand-ink"
          >
            <ArrowUpRightIcon className="size-5" />
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "grid items-start gap-4 p-4",
          artwork
            ? "grid-cols-[auto_minmax(0,1fr)]"
            : "grid-cols-[auto_minmax(0,1fr)_auto]",
        )}
      >
        <ProgramDateStamp
          size="sm"
          start={nextOccurrence.startsAt}
          third="time"
        />

        <div className="min-w-0">
          <h3 className="text-balance font-display text-xl font-bold leading-tight sm:text-2xl">
            {/* Stretched over the whole card; the context link sits above it. */}
            <Link
              href={href}
              className="decoration-current decoration-2 underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              {session.title}
            </Link>
          </h3>

          {/* Beside the stamp, so the type costs no row of its own. */}
          <p className="mt-1 text-sm text-brand-ink/75">
            <span>{SESSION_TYPE_LABELS[session.type]}</span>
            {session.topic ? (
              <>
                {" "}
                · <span>{session.topic}</span>
              </>
            ) : null}
            {speakerNames ? (
              <>
                {" "}
                · <span>Con {speakerNames}</span>
              </>
            ) : null}
          </p>

          {otherDates > 0 ? (
            <p className="mt-1 text-xs tabular-nums text-brand-ink/75">
              + {otherDates} {otherDates === 1 ? "fecha" : "fechas"}
            </p>
          ) : null}
        </div>

        {/* With no picture to carry it, the "opens" cue sits beside the
            title. */}
        {artwork ? null : (
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full bg-brand-lavender text-brand-ink"
          >
            <ArrowUpRightIcon className="size-5 transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
          </span>
        )}

        {/* Full width under the date; clamped so cards in a row stay close
            in height. The session page has the whole text. */}
        {session.description ? (
          <p className="col-span-full line-clamp-3 text-sm leading-6 text-brand-ink/75">
            {session.description}
          </p>
        ) : null}
      </div>

      {/* The talón: the ticket perforation above the price stub. */}
      <div className="mx-4 mb-4 mt-auto flex items-end justify-between gap-4 border-t-2 border-dashed border-brand-primary/25 pt-3">
        <p className="min-w-0">
          {context ? (
            <Link
              href={context.href}
              className="relative z-10 text-sm font-medium text-brand-primary underline underline-offset-4 [@media(hover:hover)]:no-underline [@media(hover:hover)]:hover:underline"
            >
              {context.label}
            </Link>
          ) : null}
        </p>
        <p className="shrink-0 text-right text-sm font-semibold tabular-nums">
          <ViewerSessionPrice
            publicPrice={publicPrice}
            participantPrice={participantPrice}
          />
        </p>
      </div>
    </Card>
  );
}
