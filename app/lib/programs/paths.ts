/**
 * Public and admin URLs for programs and sessions, in one place.
 *
 * A standalone session has no program, so its URL cannot be built from a
 * program slug: it lives at `/programs/sessions/{slug}`, a namespace that
 * `RESERVED_PROGRAM_SLUGS` keeps free of programs.
 */

type SessionRef = {
  slug: string;
  program: { slug: string } | null;
};

type SessionAdminRef = {
  id: number;
  programId: number | null;
};

/**
 * Statuses whose public festival page exists; must match
 * `fetchPublicFestivalPage`. A draft festival has no page yet and has not been
 * announced, so nothing public should name or link it.
 */
const PUBLIC_FESTIVAL_STATUSES: ReadonlySet<string> = new Set([
  "published",
  "active",
  "archived",
]);

/** The festival's public page, or null while it is still a draft. */
export function publicFestivalPath(festival: {
  id: number;
  status: string;
}): string | null {
  return PUBLIC_FESTIVAL_STATUSES.has(festival.status)
    ? `/festivals/${festival.id}`
    : null;
}

export function programPath(programSlug: string): string {
  return `/programs/${programSlug}`;
}

export function sessionPath(session: SessionRef): string {
  return session.program
    ? `/programs/${session.program.slug}/${session.slug}`
    : `/programs/sessions/${session.slug}`;
}

export function sessionAdminPath(session: SessionAdminRef): string {
  return session.programId === null
    ? `/dashboard/programs/sessions/${session.id}`
    : `/dashboard/programs/${session.programId}/sessions/${session.id}`;
}
