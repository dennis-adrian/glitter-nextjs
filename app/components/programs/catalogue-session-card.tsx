import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import ProgramDateStamp from "@/app/components/programs/program-date-stamp";
import SessionTypePill from "@/app/components/programs/session-type-pill";
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
  const isTalk = session.type === "talk";
  const typeLabel = SESSION_TYPE_LABELS[session.type];
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
      <div
        className={cn(
          "relative m-2 mb-0 aspect-4/3 overflow-hidden rounded-xl",
          isTalk ? "bg-brand-lavender" : "bg-brand-coral-soft",
        )}
      >
        {/* A second way in for pointer users; the title link below is the
            one keyboard and screen-reader users get. */}
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 block"
        >
          {artwork ? (
            <Image
              src={artwork.src}
              alt={artwork.alt}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className={cn(
                "object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.02]",
                artwork.kind === "speaker" && "object-top",
              )}
            />
          ) : (
            <span className="absolute inset-0 flex flex-col justify-end p-6">
              <span
                aria-hidden="true"
                className="absolute right-5 top-5 size-5 bg-brand-primary [clip-path:polygon(50%_0%,58%_42%,100%_50%,58%_58%,50%_100%,42%_58%,0%_50%,42%_42%)]"
              />
              {/* Clamped: a long topic would otherwise climb under the badge. */}
              <span className="line-clamp-3 text-balance font-display text-3xl font-extrabold leading-tight tracking-[-0.5px]">
                {session.topic ?? typeLabel}
              </span>
            </span>
          )}
        </Link>
        <SessionTypePill
          type={session.type}
          className="pointer-events-none absolute left-3 top-3"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-brand-card text-brand-ink"
        >
          <ArrowUpRightIcon className="size-5" />
        </span>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 p-4">
        <ProgramDateStamp
          size="sm"
          start={nextOccurrence.startsAt}
          third="time"
        />

        <div className="min-w-0">
          <h3 className="text-balance font-display text-xl font-bold leading-tight sm:text-2xl">
            <Link
              href={href}
              className="decoration-current decoration-2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              {session.title}
            </Link>
          </h3>

          {speakerNames ? (
            <p className="mt-1 text-sm text-brand-ink/75">Con {speakerNames}</p>
          ) : null}

          {otherDates > 0 ? (
            <p className="mt-1 text-xs tabular-nums text-brand-ink/75">
              + {otherDates} {otherDates === 1 ? "fecha" : "fechas"}
            </p>
          ) : null}
        </div>
      </div>

      {/* The talón: the ticket perforation above the price stub. */}
      <div className="mx-4 mb-4 mt-auto flex items-end justify-between gap-4 border-t-2 border-dashed border-brand-primary/25 pt-3">
        <p className="min-w-0">
          {context ? (
            <Link
              href={context.href}
              className="text-sm font-medium text-brand-primary underline underline-offset-4 [@media(hover:hover)]:no-underline [@media(hover:hover)]:hover:underline"
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
