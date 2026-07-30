import "server-only";

import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { cache } from "react";

import type {
  Program,
  ProgramSettings,
  Speaker,
  Venue,
} from "@/app/lib/programs/definitions";
import { db } from "@/db";
import {
  programSessions,
  programSettings,
  programs,
  sessionOccurrences,
  sessionSpeakers,
  speakers,
  venues,
} from "@/db/schema";

const SETTINGS_KEY = "global";

/**
 * Reads the singleton settings row, creating it on first request so no seed
 * migration is needed. Follows `app/lib/store_settings/data.ts`.
 */
export const fetchProgramSettings = cache(
  async (): Promise<ProgramSettings> => {
    const existing = await db
      .select()
      .from(programSettings)
      .where(eq(programSettings.key, SETTINGS_KEY))
      .limit(1);

    if (existing.length > 0) return existing[0];

    const inserted = await db
      .insert(programSettings)
      .values({ key: SETTINGS_KEY })
      .onConflictDoNothing({ target: programSettings.key })
      .returning();

    if (inserted.length > 0) return inserted[0];

    // A concurrent request inserted the row first; read it back.
    const [row] = await db
      .select()
      .from(programSettings)
      .where(eq(programSettings.key, SETTINGS_KEY))
      .limit(1);

    // Unreachable short of the row being deleted between the two statements.
    // Every caller reads fields off the result, so an absent row is a broken
    // invariant, not a value to hand back.
    if (!row) {
      throw new Error(`Missing program settings row for key "${SETTINGS_KEY}"`);
    }

    return row;
  },
);

/**
 * Everything a session needs to render, admin or public.
 *
 * The booleans are pinned with `as const` because drizzle's `DBQueryConfig`
 * requires literal `true`, while the config as a whole must NOT be `as const` —
 * that would make `orderBy` a readonly tuple, which drizzle rejects.
 */
const sessionWith = {
  venue: true as const,
  occurrences: {
    // Its own venue, not just the session's: an occurrence may be moved
    // somewhere neither the session nor the program points at, and the page
    // would otherwise show no location at all.
    with: { venue: true as const },
    orderBy: [asc(sessionOccurrences.startsAt)],
  },
  sessionSpeakers: {
    with: { speaker: true as const },
    orderBy: [asc(sessionSpeakers.displayOrder)],
  },
};

const programWith = {
  festival: true as const,
  defaultVenue: true as const,
  sessions: {
    with: sessionWith,
    orderBy: [asc(programSessions.displayOrder), asc(programSessions.title)],
  },
};

/* ----------------------------------- Admin ---------------------------------- */

export const fetchProgramsForAdmin = cache(async () => {
  return db.query.programs.findMany({
    with: programWith,
    orderBy: [desc(programs.createdAt)],
  });
});

export const fetchProgramForAdmin = cache(async (programId: number) => {
  return db.query.programs.findFirst({
    where: eq(programs.id, programId),
    with: programWith,
  });
});

export const fetchSessionForAdmin = cache(async (sessionId: number) => {
  return db.query.programSessions.findFirst({
    where: eq(programSessions.id, sessionId),
    with: {
      ...sessionWith,
      program: { with: { defaultVenue: true } },
    },
  });
});

export const fetchVenues = cache(async (): Promise<Venue[]> => {
  return db.select().from(venues).orderBy(asc(venues.name));
});

/**
 * Topics already in use, for the session form's picker.
 *
 * Topic stays plain text on the session; this distinct list is what makes
 * separate sessions converge on the same value instead of each inventing its
 * own spelling. If topics ever need renaming or filtering in their own right,
 * these values are the seed for a real vocabulary table.
 */
export const fetchSessionTopics = cache(async (): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ topic: programSessions.topic })
    .from(programSessions)
    .where(isNotNull(programSessions.topic))
    .orderBy(asc(programSessions.topic));

  return rows
    .map((row) => row.topic)
    .filter((topic): topic is string => Boolean(topic));
});

export const fetchSpeakers = cache(async (): Promise<Speaker[]> => {
  return db.select().from(speakers).orderBy(asc(speakers.publicName));
});

/* ---------------------------------- Public ---------------------------------- */

export const fetchPublishedPrograms = cache(async (): Promise<Program[]> => {
  return db
    .select()
    .from(programs)
    .where(eq(programs.status, "published"))
    .orderBy(desc(programs.startDate));
});

/**
 * A published program carrying only its published sessions. A draft session
 * inside a published program stays invisible, which is what makes per-session
 * publication safe to use while the rest of the program is still being written.
 */
export const fetchPublishedProgramBySlug = cache(async (slug: string) => {
  return db.query.programs.findFirst({
    where: and(eq(programs.slug, slug), eq(programs.status, "published")),
    with: {
      ...programWith,
      sessions: {
        ...programWith.sessions,
        where: eq(programSessions.status, "published"),
      },
    },
  });
});

export const fetchPublishedSession = cache(
  async (programSlug: string, sessionSlug: string) => {
    const program = await db.query.programs.findFirst({
      where: and(
        eq(programs.slug, programSlug),
        eq(programs.status, "published"),
      ),
      columns: { id: true },
    });

    if (!program) return undefined;

    return db.query.programSessions.findFirst({
      where: and(
        eq(programSessions.programId, program.id),
        eq(programSessions.slug, sessionSlug),
        eq(programSessions.status, "published"),
      ),
      with: {
        ...sessionWith,
        program: { with: { defaultVenue: true, festival: true } },
      },
    });
  },
);

/**
 * Where the "Semana Glitter" menu entry should point.
 *
 * One published program is the launch case, and sending someone to a catalogue
 * listing a single item is a wasted click — so it links straight to that
 * program. With several, the catalogue is the useful landing page. With none
 * there is nothing to link to and the caller hides the entry.
 */
export const fetchProgramsNavTarget = cache(
  async (): Promise<string | null> => {
    const published = await db
      .select({ slug: programs.slug })
      .from(programs)
      .where(eq(programs.status, "published"))
      .orderBy(asc(programs.startDate), asc(programs.id))
      .limit(2);

    if (published.length === 0) return null;
    if (published.length === 1) return `/programs/${published[0].slug}`;

    return "/programs";
  },
);
