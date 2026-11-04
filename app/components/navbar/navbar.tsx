import ImpersonationBanner from "@/app/components/impersonation/impersonation-banner";
import AnnouncementStrip from "@/app/components/navbar/announcement-strip";
import NavbarClient from "@/app/components/navbar/navbar-client";
import {
  resolveNavFlags,
  resolveActiveFestival,
  resolveSuppliesOpen,
} from "@/app/components/navbar/nav-flags";
import {
  getLayoutViewer,
  isLayoutFeatureEnabled,
  isStaticLayoutRender,
} from "@/app/lib/feature_flags/helpers";
import { getImpersonation } from "@/app/lib/impersonation/viewer";
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
    {
      programsHref,
      creditsEnabled,
      blogEnabled,
      communicationsEnabled,
      paidProgramsEnabled,
    },
    notificationsEnabled,
    pushPublicKey,
    landingContent,
    layoutViewer,
    staticRender,
  ] = await Promise.all([
    resolveNavFlags(),
    isLayoutFeatureEnabled("notifications"),
    layoutPushPublicKey(),
    getPublishedLandingContent(),
    getLayoutViewer(),
    isStaticLayoutRender(),
  ]);
  // While an admin views the app as a participant, `layoutViewer` is the
  // participant, so the whole shell below is theirs; the banner says so.
  const view = staticRender ? null : await getImpersonation().catch(() => null);
  const bannerView = view
    ? {
        secondsLeft: view.secondsLeft,
        subject: {
          id: view.subject.id,
          displayName: view.subject.displayName,
          firstName: view.subject.firstName,
          lastName: view.subject.lastName,
          email: view.subject.email,
          imageUrl: view.subject.imageUrl,
        },
      }
    : null;

  // Only the two fields the app shell decides on cross to the client.
  const viewer = layoutViewer
    ? { role: layoutViewer.role, status: layoutViewer.status }
    : null;
  const [suppliesOpen, activeFestival] = await Promise.all([
    resolveSuppliesOpen(viewer?.status),
    resolveActiveFestival(viewer?.role),
  ]);

  return (
    <div data-site-navbar data-sticky-top className="sticky top-0 z-50">
      {/* First, above the strip, the installed app's top bar and the
          header: a view as someone else is never out of sight. */}
      <ImpersonationBanner initial={bannerView} probe={staticRender} />
      <AnnouncementStrip announcement={landingContent.announcement} />
      <NavbarClient
        programsHref={programsHref}
        creditsEnabled={creditsEnabled}
        suppliesOpen={suppliesOpen}
        activeFestival={activeFestival}
        blogEnabled={blogEnabled}
        communicationsEnabled={communicationsEnabled}
        paidProgramsEnabled={paidProgramsEnabled}
        notificationsEnabled={notificationsEnabled}
        pushPublicKey={pushPublicKey}
        viewer={viewer}
      />
    </div>
  );
}
