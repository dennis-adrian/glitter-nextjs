import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { cache } from "react";

import { resolveProgramsNavTarget } from "@/app/lib/programs/catalogue";
import type {
  Program,
  ProgramSettings,
  Speaker,
  Venue,
} from "@/app/lib/programs/definitions";
import { sessionPath } from "@/app/lib/programs/paths";
import { utcTimestamp } from "@/app/lib/sql-time";
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

/**
 * The context a public session page needs around the session itself. A
 * program session has a program (whose festival is the festival); a standalone
 * session has none and may carry a festival of its own. Both shapes load the
 * same relations so one page component renders either.
 */
const sessionContextWith = {
  program: { with: { defaultVenue: true as const, festival: true as const } },
  festival: true as const,
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
      festival: true,
    },
  });
});

/**
 * Standalone sessions for the admin list, newest first. Only what the list
 * shows: festival, status, and occurrence timing for the next date.
 */
export const fetchStandaloneSessionsForAdmin = cache(async () => {
  return db.query.programSessions.findMany({
    where: isNull(programSessions.programId),
    with: {
      festival: { columns: { id: true, name: true } },
      occurrences: {
        columns: {
          id: true,
          startsAt: true,
          endsAt: true,
          lifecycleStatus: true,
        },
        orderBy: [asc(sessionOccurrences.startsAt)],
      },
    },
    orderBy: [desc(programSessions.createdAt)],
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
  return (
    db
      .select()
      .from(programs)
      .where(eq(programs.status, "published"))
      // Undated programs last: Postgres sorts nulls first in descending order.
      .orderBy(sql`${programs.startDate} desc nulls last`, desc(programs.id))
  );
});

/**
 * Both program route lists feed `generateStaticParams`, which runs while the
 * build collects page data. The routes are `force-static` with `revalidate`
 * set and leave `dynamicParams` at its default of true, so an empty list only
 * costs prerendering: each page is rendered on first request and cached from
 * there. Nothing renders incorrectly.
 *
 * That makes an unreachable database a bad reason to fail the whole build —
 * `next build` on a machine whose database is not up, or a CI job that builds
 * without one, has no database to reach and does not need one. A deploy still
 * does: `vercel-build` runs `pnpm migrate` first, so a genuinely unreachable
 * database fails there, before this code is ever called.
 *
 * It is logged rather than swallowed, because a deploy that quietly prerenders
 * nothing is worth noticing.
 */
async function routeParamsOrEmpty<T>(
  label: string,
  query: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await query();
  } catch (error) {
    console.error(
      `${label}: could not read route params, continuing without prerendered ` +
        `pages. They will render on demand instead.`,
      error,
    );
    return [];
  }
}

/**
 * Every public route generated at build time. This intentionally returns only
 * route params so prerendering does not load the full catalogue graph twice.
 */
export const fetchPublishedProgramRouteParams = cache(async () =>
  routeParamsOrEmpty("fetchPublishedProgramRouteParams", () =>
    db
      .select({ slug: programs.slug })
      .from(programs)
      .where(eq(programs.status, "published"))
      .orderBy(asc(programs.id)),
  ),
);

export const fetchPublishedSessionRouteParams = cache(async () =>
  routeParamsOrEmpty("fetchPublishedSessionRouteParams", () =>
    db
      .select({
        slug: programs.slug,
        sessionSlug: programSessions.slug,
      })
      .from(programSessions)
      .innerJoin(programs, eq(programSessions.programId, programs.id))
      .where(
        and(
          eq(programs.status, "published"),
          eq(programSessions.status, "published"),
        ),
      )
      .orderBy(asc(programs.id), asc(programSessions.id)),
  ),
);

export const fetchPublishedStandaloneSessionRouteParams = cache(async () =>
  routeParamsOrEmpty("fetchPublishedStandaloneSessionRouteParams", () =>
    db
      .select({ slug: programSessions.slug })
      .from(programSessions)
      .where(
        and(
          isNull(programSessions.programId),
          eq(programSessions.status, "published"),
        ),
      )
      .orderBy(asc(programSessions.id)),
  ),
);

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
      with: { ...sessionWith, ...sessionContextWith },
    });
  },
);

/** A published standalone session, the one behind `/programs/sessions/{slug}`. */
export const fetchPublishedStandaloneSession = cache(async (slug: string) => {
  return db.query.programSessions.findFirst({
    where: and(
      isNull(programSessions.programId),
      eq(programSessions.slug, slug),
      eq(programSessions.status, "published"),
    ),
    with: { ...sessionWith, ...sessionContextWith },
  });
});

/** What both public session routes render: a program session or a standalone one. */
export type PublishedSession = NonNullable<
  Awaited<ReturnType<typeof fetchPublishedSession>>
>;

/**
 * Every published session the catalogue could list, program sessions and
 * standalone ones alike, plus every published program. Deciding what is
 * upcoming is left to `buildCatalogue`, against the caller's `now`, so the
 * listing, the menu, and the session pages share one definition.
 *
 * A session in a draft program is left out: the program still hides it.
 */
export const fetchCatalogue = cache(async () => {
  const [sessions, publishedPrograms] = await Promise.all([
    db.query.programSessions.findMany({
      where: eq(programSessions.status, "published"),
      with: {
        occurrences: {
          columns: {
            id: true,
            startsAt: true,
            endsAt: true,
            lifecycleStatus: true,
            venueId: true,
          },
          orderBy: [asc(sessionOccurrences.startsAt)],
        },
        sessionSpeakers: {
          with: { speaker: true },
          orderBy: [asc(sessionSpeakers.displayOrder)],
        },
        program: {
          columns: {
            id: true,
            slug: true,
            name: true,
            status: true,
            participantDiscountType: true,
            participantDiscountValue: true,
          },
          with: {
            festival: { columns: { id: true, name: true, status: true } },
          },
        },
        festival: { columns: { id: true, name: true, status: true } },
      },
      orderBy: [asc(programSessions.displayOrder), asc(programSessions.title)],
    }),
    fetchPublishedPrograms(),
  ]);

  return {
    sessions: sessions.filter(
      (session) =>
        session.program === null || session.program.status === "published",
    ),
    programs: publishedPrograms,
  };
});

export type CatalogueSession = Awaited<
  ReturnType<typeof fetchCatalogue>
>["sessions"][number];

/**
 * Where the "Charlas y Talleres" menu entry should point; the rule itself is
 * `resolveProgramsNavTarget`. This only gathers its input: every published
 * session, standalone or in a published program, with an occurrence that has
 * not ended. Kept to one narrow query because the navbar renders on every page.
 */
export const fetchProgramsNavTarget = cache(
  async (): Promise<string | null> => {
    const upcoming = await db
      .selectDistinct({
        slug: programSessions.slug,
        programSlug: programs.slug,
      })
      .from(programSessions)
      .innerJoin(
        sessionOccurrences,
        eq(sessionOccurrences.sessionId, programSessions.id),
      )
      // Left: a standalone session has no program and must still count.
      .leftJoin(programs, eq(programs.id, programSessions.programId))
      .where(
        and(
          eq(programSessions.status, "published"),
          or(
            isNull(programSessions.programId),
            eq(programs.status, "published"),
          ),
          eq(sessionOccurrences.lifecycleStatus, "scheduled"),
          // The column holds UTC wall-clock; see `utcTimestamp`.
          gt(sessionOccurrences.endsAt, utcTimestamp(new Date())),
        ),
      );

    return resolveProgramsNavTarget(
      upcoming.map((row) => ({
        path: sessionPath({
          slug: row.slug,
          program: row.programSlug === null ? null : { slug: row.programSlug },
        }),
        programSlug: row.programSlug,
      })),
    );
  },
);
