import "server-only";

import { isLayoutFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchProgramsNavTarget } from "@/app/lib/programs/data";

/**
 * Both flags are required: `programs_nav_entry` is what an admin toggles to
 * show or hide the entry, and `paid_programs` is what makes the destination
 * exist at all — linking to a route that 404s would be worse than no link.
 */
export async function resolveProgramsHref(): Promise<string | null> {
  const [navEnabled, programsEnabled] = await Promise.all([
    isLayoutFeatureEnabled("programs_nav_entry"),
    isLayoutFeatureEnabled("paid_programs"),
  ]);

  if (!navEnabled || !programsEnabled) return null;

  // Null when no published session has a date still ahead — an entry leading
  // to an empty catalogue is worse than no entry.
  return fetchProgramsNavTarget();
}

/** The flags that decide which navigation entries exist for this viewer. */
export async function resolveNavFlags() {
  const [
    programsHref,
    creditsEnabled,
    blogEnabled,
    communicationsEnabled,
    paidProgramsEnabled,
  ] = await Promise.all([
    resolveProgramsHref(),
    isLayoutFeatureEnabled("credits"),
    isLayoutFeatureEnabled("blog"),
    isLayoutFeatureEnabled("comunicados"),
    isLayoutFeatureEnabled("paid_programs"),
  ]);

  return {
    programsHref,
    creditsEnabled,
    blogEnabled,
    communicationsEnabled,
    paidProgramsEnabled,
  };
}

/**
 * Whether Tiendita should hold the supplies market too: only verified
 * profiles are offered it, so nobody else's navigation reads the store
 * settings (the navbar also renders on static pages, with no viewer).
 */
export async function resolveSuppliesOpen(
  viewerStatus: string | null | undefined,
): Promise<boolean> {
  if (viewerStatus !== "verified") return false;
  // Loaded here, not at the top: the store settings bring the database
  // client, which a navbar for anyone else never needs.
  const { resolveSectionClosure } = await import(
    "@/app/lib/store_settings/closure"
  );
  const closure = await resolveSectionClosure("supplies").catch(() => null);
  return closure ? !closure.closed : false;
}

/**
 * For staff: the festival in progress, whose sections lead their sidebar.
 * Read for staff only, and loaded lazily for the same reason as above.
 */
export async function resolveStaffFestival(
  viewerRole: string | null | undefined,
): Promise<{ id: number; name: string; status: "draft" | "published" | "active" | "archived" } | null> {
  if (viewerRole !== "admin" && viewerRole !== "festival_admin") return null;
  const { getActiveFestivalBase } = await import(
    "@/app/lib/festivals/helpers"
  );
  const festival = await getActiveFestivalBase().catch(() => null);
  return festival
    ? { id: festival.id, name: festival.name, status: festival.status }
    : null;
}
