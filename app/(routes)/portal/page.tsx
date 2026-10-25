import { BookOpenIcon, CakeIcon, CogIcon } from "lucide-react";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import VerificationStatusLabel from "@/app/components/atoms/verification-status-label";
import DashboardActivities from "@/app/components/home/dashboard-activities";
import DashboardNextEvent from "@/app/components/home/dashboard-next-event";
import DashboardNotifications from "@/app/components/home/dashboard-notifications";
import DashboardStats from "@/app/components/home/dashboard-stats";
import {
  PortalBanners,
  PortalBannersSkeleton,
} from "@/app/components/marketing/portal-banners";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";
import PausedParticipantDashboard from "@/app/components/participant_dashboard/paused-dashboard";
import RestrictedDashboard from "@/app/components/participant_dashboard/restricted-dashboard";
import HubPendingList from "@/app/components/participations/hub/hub-pending-list";
import { HubSection } from "@/app/components/participations/hub/hub-section";
import { HUB_SECTIONS } from "@/app/components/participations/hub/hub-quick-access";
import { hubSectionAvailability } from "@/app/components/participations/hub/hub-shortcuts";
import ParticipationStatusCard from "@/app/components/participations/hub/participation-status-card";
import { readCreditBalances } from "@/app/lib/credits/service";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import {
  buildDashboardStats,
  countUpcomingPurchases,
} from "@/app/lib/home/dashboard";
import {
  fetchInboxPage,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";
import { fetchOrderCountsByUserId } from "@/app/lib/orders/actions";
import { loadParticipationHub } from "@/app/lib/participations/hub";
import { daysUntil } from "@/app/lib/participations/hub-status";
import { canAuthorPosts } from "@/app/lib/posts/eligibility";
import { fetchPurchasesForUser } from "@/app/lib/programs/purchase-queries";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inicio",
};

/** How many of the participation's open items the home lists. */
const PENDING_ON_HOME = 3;
const NOTIFICATIONS_ON_HOME = 3;

/**
 * The signed-in home: the participant's figures, their participation in the
 * active festival and what it still needs, and on desktop the festival's
 * activities and the latest notifications. The hub has the rest.
 */
export default async function ParticipantDashboardPage() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/");

  if (hub.kind === "not-verified") {
    const { profile } = hub;
    const { status } = profile;
    if (status === "paused") {
      return <PausedParticipantDashboard profile={profile} />;
    }
    if (status !== "verified") {
      return <RestrictedDashboard profile={profile} status={status} />;
    }
  }

  const profile = hub.profile;
  const festivalHub = hub.kind === "hub" ? hub : null;

  // Admins reach the blog through the dashboard; this CTA is the only entry
  // point contributors have, so it is scoped to eligible non-admins.
  const isAdmin = profile.role === "admin" || profile.role === "festival_admin";

  const [
    showBlogCta,
    creditBalance,
    orderCounts,
    upcomingPurchases,
    notifications,
  ] = await Promise.all([
    isAdmin ? false : canAuthorPosts(profile),
    isFeatureEnabled("credits", profile).then(async (on) =>
      on ? (await readCreditBalances(profile.id)).spendableBalance : null,
    ),
    fetchOrderCountsByUserId(profile.id),
    isFeatureEnabled("paid_programs", profile).then(async (on) =>
      on ? countUpcomingPurchases(await fetchPurchasesForUser(profile.id)) : null,
    ),
    resolveInboxViewerWithAccess().then(async (viewer) =>
      viewer
        ? (await fetchInboxPage(viewer, { limit: NOTIFICATIONS_ON_HOME }))
            .items
        : null,
    ),
  ]);

  const daysLeft = festivalHub
    ? daysUntil(festivalHub.festival.festivalDates[0]?.startDate, new Date())
    : null;
  const stats = buildDashboardStats({
    creditBalance,
    orderCounts,
    upcomingPurchases,
    nextFestival:
      festivalHub && daysLeft
        ? { name: festivalHub.festival.name, daysLeft }
        : null,
  });

  const openItems = festivalHub
    ? festivalHub.pending.filter((item) => !item.done)
    : [];
  const showActivities = festivalHub
    ? hubSectionAvailability(festivalHub).activities
    : false;
  const showAside = showActivities || notifications != null;

  return (
    <div className="container flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <VerificationStatusLabel status={profile.status} />
          <h1 className="font-display text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
            Hola, {profile.firstName ?? profile.displayName ?? "artista"}
          </h1>
          {profile.verifiedAt && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CakeIcon className="size-4" />
              Te uniste en {DateTime.fromJSDate(profile.verifiedAt).year}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {showBlogCta && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/portal/blog">
                <BookOpenIcon className="mr-1 size-4" />
                Mis artículos
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/my_profile" aria-label="Configuración">
              <CogIcon className="size-4 md:mr-1" />
              <span className="hidden md:inline">Configuración</span>
            </Link>
          </Button>
        </div>
      </header>

      <DashboardStats stats={stats} />

      <div
        className={
          showAside
            ? "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start"
            : "grid grid-cols-1 gap-5"
        }
      >
        <div className="flex min-w-0 flex-col gap-5">
          {festivalHub ? (
            <>
              <HubSection
                title="Mi participación"
                action={{ label: "Participaciones", href: "/my_participations" }}
              >
                <ParticipationStatusCard hub={festivalHub} showFestival />
              </HubSection>

              {openItems.length > 0 ? (
                <HubSection
                  title={`Pendientes (${openItems.length})`}
                  action={
                    openItems.length > PENDING_ON_HOME
                      ? { label: "Ver todo", href: "/my_participations" }
                      : undefined
                  }
                >
                  <HubPendingList items={openItems.slice(0, PENDING_ON_HOME)} />
                </HubSection>
              ) : null}

              <HubSection title="Próximo evento" className="lg:hidden">
                <DashboardNextEvent festival={festivalHub.festival} />
              </HubSection>
            </>
          ) : null}

          <Suspense fallback={<PortalBannersSkeleton />}>
            <PortalBanners />
          </Suspense>

          <ParticipationHistoryPreview
            profile={profile}
            activeFestivalId={festivalHub?.festival.id}
          />
        </div>

        {showAside ? (
          <aside className="hidden flex-col gap-5 lg:flex">
            {festivalHub && showActivities ? (
              <HubSection
                title="Actividades del festival"
                action={{ label: "Todas", href: HUB_SECTIONS.activities.href }}
              >
                <DashboardActivities
                  activities={festivalHub.activities}
                  profileId={profile.id}
                  href={HUB_SECTIONS.activities.href}
                />
              </HubSection>
            ) : null}
            {notifications ? (
              <HubSection
                title="Notificaciones recientes"
                action={{ label: "Bandeja", href: "/my_notifications" }}
              >
                <DashboardNotifications items={notifications} />
              </HubSection>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
