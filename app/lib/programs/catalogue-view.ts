import { DateTime } from "luxon";

import { formatDisplayDate } from "@/app/lib/formatters";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import { isOccurrenceUpcoming } from "@/app/lib/programs/catalogue";
import type { OccurrenceLifecycleStatus } from "@/app/lib/programs/definitions";
import { programPath, publicFestivalPath } from "@/app/lib/programs/paths";

/**
 * Presentation rules for the public catalogue's cards. `catalogue.ts` decides
 * what is listed; this decides what each card says about it. Pure, so the
 * wording rules are tested without rendering.
 */

type ContextSession = {
  program: { slug: string; name: string } | null;
  festival: { id: number; name: string; status: string } | null;
};

export type SessionContext =
  | { kind: "program"; label: string; href: string }
  | { kind: "festival"; label: string; href: string }
  | null;

/**
 * The one line saying what a session belongs to. A program session names its
 * program and links to it. A standalone session names its festival and links
 * to it, but only once the festival is public: a draft festival has no page
 * and has not been announced. A standalone session on its own says nothing,
 * since buyers are never shown a "suelta" label.
 */
export function resolveSessionContext(session: ContextSession): SessionContext {
  if (session.program) {
    return {
      kind: "program",
      label: session.program.name,
      href: programPath(session.program.slug),
    };
  }

  const festivalHref = session.festival
    ? publicFestivalPath(session.festival)
    : null;
  if (session.festival && festivalHref) {
    return {
      kind: "festival",
      label: `Parte de ${session.festival.name}`,
      href: festivalHref,
    };
  }

  return null;
}

/** How many listed sessions each program has ahead, keyed by program id. */
export function countUpcomingByProgram(
  entries: readonly { session: { programId: number | null } }[],
): Map<number, number> {
  const counts = new Map<number, number>();

  for (const { session } of entries) {
    if (session.programId === null) continue;
    counts.set(session.programId, (counts.get(session.programId) ?? 0) + 1);
  }

  return counts;
}

type OccurrenceTiming = {
  startsAt: Date;
  endsAt: Date;
  lifecycleStatus: OccurrenceLifecycleStatus;
};

/**
 * Upcoming occurrences besides the one a card shows, for its "+N fechas" note.
 * Same definition of upcoming as the listing, so the note never counts a date
 * that has stopped selling.
 */
export function countOtherUpcomingOccurrences(
  occurrences: readonly OccurrenceTiming[],
  now: Date,
): number {
  const upcoming = occurrences.filter((occurrence) =>
    isOccurrenceUpcoming(occurrence, now),
  ).length;

  return Math.max(0, upcoming - 1);
}

type ArtworkSession = {
  imageUrl: string | null;
  sessionSpeakers: readonly {
    speaker: { publicName: string; imageUrl: string | null };
  }[];
};

export type SessionArtwork = {
  src: string;
  alt: string;
  kind: "session" | "speaker";
};

/**
 * A card's picture: the session's own image, else the first speaker portrait,
 * else null and the card falls back to type. Every candidate is host-checked,
 * because rows predating the upload validation can hold an arbitrary URL.
 */
export function pickSessionArtwork(
  session: ArtworkSession,
): SessionArtwork | null {
  if (isAllowedProgramArtworkUrl(session.imageUrl)) {
    return { src: session.imageUrl, alt: "", kind: "session" };
  }

  for (const { speaker } of session.sessionSpeakers) {
    if (isAllowedProgramArtworkUrl(speaker.imageUrl)) {
      return {
        src: speaker.imageUrl,
        alt: speaker.publicName,
        kind: "speaker",
      };
    }
  }

  return null;
}

/**
 * A program's dates as one line: both ends, one date when they fall on the
 * same day, or null for an undated program.
 */
export function formatDateRange(
  startDate: Date | null,
  endDate: Date | null,
): string | null {
  const dates = new Set(
    [startDate, endDate]
      .filter((date): date is Date => date !== null)
      .map((date) => formatDisplayDate(date, DateTime.DATE_MED)),
  );

  return dates.size === 0 ? null : [...dates].join(" al ");
}
