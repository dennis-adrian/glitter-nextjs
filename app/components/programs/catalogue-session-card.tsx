import { ArrowUpRightIcon, CalendarDaysIcon } from "lucide-react";
import { DateTime } from "luxon";
import Image from "next/image";
import Link from "next/link";

import ViewerSessionPrice from "@/app/components/programs/viewer-session-price";
import { Badge } from "@/app/components/ui/badge";
import { Card } from "@/app/components/ui/card";
import { formatDisplayDate } from "@/app/lib/formatters";
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
    <Card
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-4xl border-0 shadow-none transition-transform duration-300 hover:-translate-y-1",
        isTalk ? "bg-[#ffbe57] text-[#4b255f]" : "bg-[#9347f5] text-[#fffaf3]",
      )}
    >
      <div className="relative m-3 mb-0 aspect-4/3 overflow-hidden rounded-[1.4rem] bg-[#dff8f4]">
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
                "object-cover transition duration-500 ease-out group-hover:scale-[1.035]",
                artwork.kind === "speaker" && "object-top",
              )}
            />
          ) : (
            <span className="absolute inset-0 flex flex-col justify-end p-6 text-[#4b255f]">
              {/* Clamped: a long topic would otherwise climb under the badge. */}
              <span className="font-display font-bold line-clamp-3 text-balance text-4xl uppercase leading-none sm:text-5xl">
                {session.topic ?? typeLabel}
              </span>
            </span>
          )}
        </Link>
        <Badge className="pointer-events-none absolute left-3 top-3 border-transparent bg-[#fffaf3] px-3 py-1.5 font-black uppercase tracking-[0.14em] text-[#4b255f]">
          {typeLabel}
        </Badge>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-[#fffaf3] text-[#4b255f] transition-transform duration-300 group-hover:rotate-6"
        >
          <ArrowUpRightIcon className="size-5" />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-black uppercase tracking-[0.14em]",
            isTalk ? "text-[#7b3b76]" : "text-[#e5d5ff]",
          )}
        >
          <CalendarDaysIcon className="size-4 shrink-0" aria-hidden="true" />
          <time dateTime={nextOccurrence.startsAt.toISOString()}>
            {formatDisplayDate(nextOccurrence.startsAt, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}{" "}
            · {formatDisplayDate(nextOccurrence.startsAt, DateTime.TIME_SIMPLE)}
          </time>
          {otherDates > 0 ? (
            <span className="normal-case tracking-normal">
              + {otherDates} {otherDates === 1 ? "fecha" : "fechas"}
            </span>
          ) : null}
        </p>

        <h3 className="mt-3 font-display font-bold text-balance text-3xl uppercase leading-[0.98] sm:text-4xl">
          <Link
            href={href}
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

        <div className="mt-auto pt-6">
          <div
            className={cn(
              "flex items-end justify-between gap-4 border-t pt-4",
              isTalk ? "border-[#4b255f]/25" : "border-white/35",
            )}
          >
            <p className="min-w-0 text-sm font-bold">
              {context ? (
                <Link
                  href={context.href}
                  className="underline decoration-2 underline-offset-4 [@media(hover:hover)]:no-underline [@media(hover:hover)]:hover:underline"
                >
                  {context.label}
                </Link>
              ) : null}
            </p>
            <p className="shrink-0 text-right text-sm font-black">
              <ViewerSessionPrice
                publicPrice={publicPrice}
                participantPrice={participantPrice}
              />
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
