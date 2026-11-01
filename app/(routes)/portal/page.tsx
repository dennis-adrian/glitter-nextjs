import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { ProfileType } from "@/app/api/users/definitions";
import DashboardNotifications from "@/app/components/home/dashboard-notifications";
import HomeCredits from "@/app/components/home/home-credits";
import HomeFestivalCard from "@/app/components/home/home-festival-card";
import HomeGreeting from "@/app/components/home/home-greeting";
import HomeHistoryCard from "@/app/components/home/home-history-card";
import HomeReviewNote from "@/app/components/home/home-review-note";
import HomeStoreStrip from "@/app/components/home/home-store-strip";
import HomeTasks from "@/app/components/home/home-tasks";
import PausedParticipantDashboard from "@/app/components/participant_dashboard/paused-dashboard";
import RestrictedDashboard from "@/app/components/participant_dashboard/restricted-dashboard";
import { HubSection } from "@/app/components/participations/hub/hub-section";
import {
  badgeFor,
  categoryName,
} from "@/app/components/participations/hub/participation-status-card";
import { readCreditBalances } from "@/app/lib/credits/service";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { getActiveFestivalBase } from "@/app/lib/festivals/helpers";
import { participationSentence } from "@/app/lib/home/festival";
import {
  loadHistorySummary,
  loadHomeStore,
  loadUpcomingFestival,
  loadVerifiedTasks,
  profileReviewTasks,
} from "@/app/lib/home/load";
import {
  fetchInboxPage,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";
import {
  loadParticipationHub,
  type ParticipationHub,
} from "@/app/lib/participations/hub";
import { daysUntil } from "@/app/lib/participations/hub-status";
import { canAuthorPosts } from "@/app/lib/posts/eligibility";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inicio",
};

const NOTIFICATIONS_ON_HOME = 3;

function firstDayLeft(festival: Pick<FestivalWithDates, "festivalDates">, now: Date) {
  const start = [...festival.festivalDates].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  )[0]?.startDate;
  return daysUntil(start, now);
}

async function loadNotifications() {
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return null;
  return (await fetchInboxPage(viewer, { limit: NOTIFICATIONS_ON_HOME })).items;
}

/**
 * Two columns from the desktop breakpoint: the festival, the store and the
 * history on the left; what is always there (tasks, credits) and the latest
 * notifications on the right. On a phone the always-there blocks come right
 * under the greeting, so they render twice and each copy hides at the other
 * size.
 */
function HomeLayout({
  greeting,
  always,
  main,
  notifications,
}: {
  greeting: React.ReactNode;
  always: React.ReactNode;
  main: React.ReactNode;
  notifications: Awaited<ReturnType<typeof loadNotifications>>;
}) {
  return (
    <div className="container max-w-6xl p-4 md:p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {greeting}
          <div className="flex flex-col gap-6 lg:hidden">{always}</div>
          {main}
        </div>
        <aside className="hidden flex-col gap-6 lg:flex">
          {always}
          {notifications ? (
            <HubSection
              title="Notificaciones"
              action={{ label: "Ver todas", href: "/my_notifications" }}
            >
              <DashboardNotifications items={notifications} />
            </HubSection>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function hubFestivalCard(hub: ParticipationHub, now: Date) {
  const reservation = hub.reservation;
  const partners =
    reservation?.participants
      .map((participant) => participant.user)
      .filter((user) => user.id !== hub.profile.id)
      .map((user) => user.displayName ?? "tu compañero") ?? [];

  return (
    <HomeFestivalCard
      title="Festival en curso"
      festival={hub.festival}
      href="/my_participations"
      daysLeft={firstDayLeft(hub.festival, now)}
      badge={badgeFor(hub.status, hub.reservationBlock)}
      sentence={participationSentence({
        status: hub.status,
        reservationsStartDate: hub.festival.reservationsStartDate,
        standLabel: reservation
          ? `stand ${reservationStandLabel(reservation)}`
          : hub.closedReservation
            ? `stand ${hub.closedReservation.standLabel}`
            : null,
        categoryName: categoryName(hub.profile.category),
        partners,
        blockedUntil: hub.reservationBlock?.eligibleAt ?? null,
      })}
    />
  );
}

/**
 * Inicio for a verified participant: what is pending and the credits, always;
 * then the festival in its banner, the store, and the history.
 */
async function VerifiedHome({
  profile,
  hub,
}: {
  profile: ProfileType;
  hub: ParticipationHub | null;
}) {
  const now = new Date();
  const isStaff = profile.role === "admin" || profile.role === "festival_admin";

  const [showBlogCta, balances, notifications, upcoming, history] =
    await Promise.all([
      // Staff reach the blog through the dashboard; contributors only here.
      isStaff ? false : canAuthorPosts(profile),
      isFeatureEnabled("credits", profile).then((on) =>
        on ? readCreditBalances(profile.id) : null,
      ),
      loadNotifications(),
      hub ? Promise.resolve(null) : loadUpcomingFestival(),
      loadHistorySummary(profile, hub?.festival.id ?? null),
    ]);

  const [tasks, store] = await Promise.all([
    loadVerifiedTasks({
      profile,
      hub,
      creditDebt: balances ? Math.max(0, -balances.ledgerBalance) : 0,
      now,
    }),
    // Supplies and rentals for a stand that is coming up; merch otherwise,
    // and merch too when the supplies market is closed.
    hub?.isConfirmed
      ? loadHomeStore("supplies").then((supplies) =>
          supplies ? supplies : loadHomeStore("merch"),
        )
      : loadHomeStore("merch"),
  ]);

  return (
    <HomeLayout
      greeting={<HomeGreeting profile={profile} showBlogCta={showBlogCta} />}
      always={
        <>
          <HomeTasks tasks={tasks} now={now} />
          {balances ? <HomeCredits balances={balances} /> : null}
        </>
      }
      main={
        <>
          {hub ? (
            hubFestivalCard(hub, now)
          ) : upcoming ? (
            <HomeFestivalCard
              title="Próximo festival"
              festival={upcoming}
              href={`/festivals/${upcoming.id}`}
              daysLeft={firstDayLeft(upcoming, now)}
            />
          ) : null}
          {store ? <HomeStoreStrip store={store} /> : null}
          <HomeHistoryCard summary={history} wide />
        </>
      }
      notifications={notifications}
    />
  );
}

/**
 * Inicio for a profile under review or not verified: what the review will
 * look at, where the review stands, and the festival as a visitor sees it.
 * No credits and no history: neither exists before verification.
 */
async function UnverifiedHome({ profile }: { profile: ProfileType }) {
  const now = new Date();
  const [active, notifications, store] = await Promise.all([
    getActiveFestivalBase(),
    loadNotifications(),
    loadHomeStore("merch"),
  ]);
  const festival = active ?? (await loadUpcomingFestival());
  const tasks = profileReviewTasks(profile);

  return (
    <HomeLayout
      greeting={<HomeGreeting profile={profile} />}
      always={
        <>
          <HomeTasks tasks={tasks} now={now} />
          <HomeReviewNote profile={profile} hasTasks={tasks.length > 0} />
        </>
      }
      main={
        <>
          {festival ? (
            <HomeFestivalCard
              title={active ? "Festival en curso" : "Próximo festival"}
              festival={festival}
              href={`/festivals/${festival.id}`}
              daysLeft={firstDayLeft(festival, now)}
            />
          ) : null}
          {store ? <HomeStoreStrip store={store} /> : null}
        </>
      }
      notifications={notifications}
    />
  );
}

export default async function HomePage() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/");

  if (hub.kind === "not-verified") {
    const { profile } = hub;
    if (profile.status === "paused") {
      return <PausedParticipantDashboard profile={profile} />;
    }
    if (profile.status === "banned") {
      return <RestrictedDashboard profile={profile} status="banned" />;
    }
    return <UnverifiedHome profile={profile} />;
  }

  return (
    <VerifiedHome
      profile={hub.profile}
      hub={hub.kind === "hub" ? hub : null}
    />
  );
}
