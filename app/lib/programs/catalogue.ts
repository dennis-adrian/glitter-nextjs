import type { OccurrenceLifecycleStatus } from "@/app/lib/programs/definitions";
import { programPath } from "@/app/lib/programs/paths";
import { hasOccurrenceEnded } from "@/app/lib/programs/state";

/**
 * What "upcoming" means for the public catalogue and the menu entry.
 *
 * Pure, like `state.ts`, so the listing, the menu, and the session hero agree
 * with each other and with enforcement: an occurrence is upcoming until it
 * ends, which is exactly when `resolveOccurrenceState` stops selling it.
 */

type OccurrenceTiming = {
  startsAt: Date;
  endsAt: Date;
  lifecycleStatus: OccurrenceLifecycleStatus;
};

/** Scheduled and not over yet: still running counts, since it still sells. */
export function isOccurrenceUpcoming(
  occurrence: OccurrenceTiming,
  now: Date,
): boolean {
  return (
    occurrence.lifecycleStatus === "scheduled" &&
    !hasOccurrenceEnded(occurrence.endsAt, now)
  );
}

/** The soonest upcoming occurrence, or null when every one is over. */
export function nextUpcomingOccurrence<T extends OccurrenceTiming>(
  occurrences: readonly T[],
  now: Date,
): T | null {
  let next: T | null = null;
  for (const occurrence of occurrences) {
    if (!isOccurrenceUpcoming(occurrence, now)) continue;
    if (next === null || occurrence.startsAt < next.startsAt) next = occurrence;
  }
  return next;
}

export type NavCandidate = {
  /** Public URL of an upcoming session. */
  path: string;
  /** Null for a standalone session. */
  programSlug: string | null;
};

/**
 * Where the "Charlas y Talleres" menu entry should point, given every
 * published session that is still upcoming.
 *
 * One session goes straight to it: a catalogue listing a single item is a
 * wasted click. Several sessions of the same program go to that program's
 * page. Anything else goes to the catalogue. Nothing upcoming returns null and
 * the caller hides the entry, since an entry leading to an empty page is worse
 * than no entry.
 */
export function resolveProgramsNavTarget(
  upcoming: readonly NavCandidate[],
): string | null {
  if (upcoming.length === 0) return null;
  if (upcoming.length === 1) return upcoming[0].path;

  const programSlugs = new Set(upcoming.map((entry) => entry.programSlug));
  const [onlyProgram] = programSlugs;
  if (programSlugs.size === 1 && onlyProgram !== null) {
    return programPath(onlyProgram);
  }

  return "/programs";
}

type CatalogueSession<O extends OccurrenceTiming> = {
  programId: number | null;
  occurrences: readonly O[];
};

type CatalogueProgram = { id: number; endDate: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export type CatalogueEntry<S, O> = {
  session: S;
  nextOccurrence: O;
};

/**
 * Splits published sessions and programs into what the catalogue shows:
 * upcoming sessions soonest first, current programs, and programs that are
 * over. Sessions that are over drop out entirely; their links keep working,
 * they are just no longer listed.
 *
 * A program is over only once it has actually happened: it held listed
 * sessions and none is ahead any more, or, with nothing scheduled at all, its
 * end date has passed. A program announced before its sessions are published
 * or scheduled is current, not "anterior".
 */
export function buildCatalogue<
  O extends OccurrenceTiming,
  S extends CatalogueSession<O>,
  P extends CatalogueProgram,
>({
  sessions,
  programs,
  now,
}: {
  sessions: readonly S[];
  programs: readonly P[];
  now: Date;
}): {
  upcomingSessions: CatalogueEntry<S, O>[];
  currentPrograms: P[];
  pastPrograms: P[];
} {
  const upcomingSessions: CatalogueEntry<S, O>[] = [];
  const programsWithUpcoming = new Set<number>();
  const programsThatHeldSessions = new Set<number>();

  for (const session of sessions) {
    if (
      session.programId !== null &&
      session.occurrences.some(
        (occurrence) => occurrence.lifecycleStatus !== "cancelled",
      )
    ) {
      programsThatHeldSessions.add(session.programId);
    }

    const nextOccurrence = nextUpcomingOccurrence(session.occurrences, now);
    if (!nextOccurrence) continue;
    upcomingSessions.push({ session, nextOccurrence });
    if (session.programId !== null) programsWithUpcoming.add(session.programId);
  }

  upcomingSessions.sort(
    (a, b) =>
      a.nextOccurrence.startsAt.getTime() - b.nextOccurrence.startsAt.getTime(),
  );

  const isOver = (program: P) =>
    !programsWithUpcoming.has(program.id) &&
    (programsThatHeldSessions.has(program.id) ||
      // Date-only, stored as the start of its day: over once that day ends.
      (program.endDate !== null &&
        program.endDate.getTime() + DAY_MS <= now.getTime()));

  return {
    upcomingSessions,
    currentPrograms: programs.filter((program) => !isOver(program)),
    pastPrograms: programs.filter(isOver),
  };
}
