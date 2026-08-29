import AnnouncementStrip from "@/app/components/navbar/announcement-strip";
import NavbarClient from "@/app/components/navbar/navbar-client";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { getPublishedLandingContent } from "@/app/lib/landing_content/data";
import { fetchProgramsNavTarget } from "@/app/lib/programs/data";

/**
 * Resolves the one piece of per-request data the menu needs on the server.
 *
 * The root layout already wraps this in its own `<Suspense>` with a
 * reserved-height fallback, so fetching here streams the navbar in rather than
 * holding up the page.
 *
 * Both flags are required: `programs_nav_entry` is what an admin toggles to
 * show or hide the entry, and `paid_programs` is what makes the destination
 * exist at all — linking to a route that 404s would be worse than no link.
 */
async function resolveProgramsHref(): Promise<string | null> {
  const [navEnabled, programsEnabled] = await Promise.all([
    isFeatureEnabled("programs_nav_entry"),
    isFeatureEnabled("paid_programs"),
  ]);

  if (!navEnabled || !programsEnabled) return null;

  // Null when nothing is published yet — an entry leading to an empty
  // catalogue is worse than no entry.
  return fetchProgramsNavTarget();
}

export default async function Navbar() {
  const [programsHref, landingContent] = await Promise.all([
    resolveProgramsHref(),
    getPublishedLandingContent(),
  ]);

  return (
    <div data-site-navbar className="sticky top-0 z-50">
      <AnnouncementStrip announcement={landingContent.announcement} />
      <NavbarClient programsHref={programsHref} />
    </div>
  );
}
