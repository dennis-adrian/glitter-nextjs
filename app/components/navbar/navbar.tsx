import AnnouncementStrip from "@/app/components/navbar/announcement-strip";
import NavbarClient from "@/app/components/navbar/navbar-client";
import { resolveNavFlags } from "@/app/components/navbar/nav-flags";
import {
  getLayoutViewer,
  isLayoutFeatureEnabled,
} from "@/app/lib/feature_flags/helpers";
import { layoutPushPublicKey } from "@/app/lib/notifications/push/access";
import { getPublishedLandingContent } from "@/app/lib/landing_content/data";

/**
 * Resolves the per-request data the menu needs on the server.
 *
 * The root layout already wraps this in its own `<Suspense>` with a
 * reserved-height fallback, so fetching here streams the navbar in rather than
 * holding up the page.
 */
export default async function Navbar() {
  const [
    { programsHref, creditsEnabled, blogEnabled },
    notificationsEnabled,
    pushPublicKey,
    landingContent,
    layoutViewer,
  ] = await Promise.all([
    resolveNavFlags(),
    isLayoutFeatureEnabled("notifications"),
    layoutPushPublicKey(),
    getPublishedLandingContent(),
    getLayoutViewer(),
  ]);

  // Only the two fields the app shell decides on cross to the client.
  const viewer = layoutViewer
    ? { role: layoutViewer.role, status: layoutViewer.status }
    : null;

  return (
    <div data-site-navbar data-sticky-top className="sticky top-0 z-50">
      <AnnouncementStrip announcement={landingContent.announcement} />
      <NavbarClient
        programsHref={programsHref}
        creditsEnabled={creditsEnabled}
        blogEnabled={blogEnabled}
        notificationsEnabled={notificationsEnabled}
        pushPublicKey={pushPublicKey}
        viewer={viewer}
      />
    </div>
  );
}
