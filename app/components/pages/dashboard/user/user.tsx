import { fetchUserProfileById } from "@/app/lib/users/queries";
import CreditAccountPanel from "@/app/components/credits/admin/credit-account-panel";
import { notFound } from "next/navigation";
import PrivateProfile from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import ProfileQuickActions from "@/app/components/user_profile/public_profile/quick-actions";
import { fetchPendingInvoicesByProfile } from "@/app/data/invoices/actions";
import { fetchParticipantActivitySummary } from "@/app/lib/participants/actions";
import { isParticipantStatus } from "@/app/lib/participants/definitions";
import { getProfileStatusLabel, getUserName } from "@/app/lib/users/utils";
import EnterAsButton from "@/app/components/impersonation/enter-as-button";
import RecentImpersonations from "@/app/components/impersonation/recent-impersonations";
import { canBeImpersonated } from "@/app/lib/impersonation/eligibility";
import { listRecentImpersonations } from "@/app/lib/impersonation/queries";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { buttonVariants } from "@/app/components/ui/button";
import { notificationLogUserHref } from "@/app/lib/notifications/admin-log-definitions";
import { BellIcon } from "lucide-react";
import Link from "next/link";

type DashboardUserPageProps = {
  profileId: number;
};
export default async function DashboardUserPage(props: DashboardUserPageProps) {
  const forProfile = await fetchUserProfileById(props.profileId);
  if (!forProfile) return notFound();

  const pendingInvoices = await fetchPendingInvoicesByProfile(props.profileId);
  const actionablePending = pendingInvoices.filter(
    (invoice) => invoice.reservation.status === "pending",
  );

  type PendingPaymentsFestivalSummary = {
    festivalId: number;
    festivalName: string;
    count: number;
  };

  let pendingPaymentsByFestival: PendingPaymentsFestivalSummary[] | undefined;
  if (actionablePending.length > 0) {
    const byFestivalId = new Map<
      number,
      { festivalName: string; count: number }
    >();
    for (const invoice of actionablePending) {
      const id = invoice.reservation.festivalId;
      const name = invoice.reservation.festival.name;
      const existing = byFestivalId.get(id);
      if (existing) existing.count++;
      else byFestivalId.set(id, { festivalName: name, count: 1 });
    }
    pendingPaymentsByFestival = [...byFestivalId.entries()]
      .map(([festivalId, { festivalName, count }]) => ({
        festivalId,
        festivalName,
        count,
      }))
      .sort((a, b) => a.festivalName.localeCompare(b.festivalName, "es"));
  }

  const activitySummary = isParticipantStatus(forProfile.status)
    ? await fetchParticipantActivitySummary(forProfile.id)
    : undefined;

  // "Entrar como participante": global admins, for participants only. The
  // start checks all of it again on the server.
  const viewer = await getCurrentUserProfile();
  const canEnterAs =
    viewer?.role === "admin" &&
    viewer.id !== forProfile.id &&
    canBeImpersonated(forProfile);
  const recentViews = canEnterAs
    ? await listRecentImpersonations({ subjectUserId: forProfile.id }, 5)
    : [];
  const displayName = getUserName(forProfile) || forProfile.email;

  return (
    <div className="mx-auto max-w-5xl p-3 md:p-6">
      <ScreenTitle title={getUserName(forProfile) || forProfile.email} />
      <div className="flex flex-col gap-4">
        {forProfile.status !== "banned" && (
          <AnnouncementCard profile={forProfile} />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 self-end">
          {/* The log is admin-only; festival admins would be sent back. */}
          {viewer?.role === "admin" ? (
            <Link
              href={notificationLogUserHref(forProfile.id)}
              className={buttonVariants({
                variant: "outline",
                wrap: true,
                className: "max-w-full gap-2",
              })}
            >
              <BellIcon className="h-4 w-4 shrink-0" aria-hidden />
              Notificaciones enviadas
            </Link>
          ) : null}
          {canEnterAs ? (
            <EnterAsButton
              person={{
                id: forProfile.id,
                name: displayName,
                email: forProfile.email,
                statusLabel: getProfileStatusLabel(forProfile.status),
              }}
              label={`Entrar como ${displayName}`}
              returnTo={`/dashboard/users/${forProfile.id}`}
              className="max-w-full"
            />
          ) : null}
          <ProfileQuickActions
            hideViewProfile
            profile={forProfile}
            activitySummary={activitySummary ?? undefined}
            pendingPaymentsByFestival={pendingPaymentsByFestival}
          />
        </div>
        <PublicProfile profile={forProfile} title="Perfil de Usuario" />
        {/* Only participants hold credits, so only they get an account panel. */}
        {isParticipantStatus(forProfile.status) && (
          <CreditAccountPanel
            userId={forProfile.id}
            participantName={getUserName(forProfile) || forProfile.email}
          />
        )}
        <PrivateProfile profile={forProfile} />
        {canEnterAs ? (
          <RecentImpersonations
            rows={recentViews}
            show="admin"
            title="Vistas recientes"
            empty="Nadie entró todavía como esta persona."
          />
        ) : null}
      </div>
    </div>
  );
}
