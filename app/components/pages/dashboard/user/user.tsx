import { fetchUserProfileById } from "@/app/api/users/actions";
import { notFound } from "next/navigation";
import PrivateProfile from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import ProfileQuickActions from "@/app/components/user_profile/public_profile/quick-actions";
import { fetchPendingInvoicesByProfile } from "@/app/data/invoices/actions";

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

  return (
    <div className="mx-auto max-w-5xl p-3 md:p-6">
      <div className="flex flex-col gap-4">
        {forProfile.status !== "banned" && (
          <AnnouncementCard profile={forProfile} />
        )}
        <div className="self-end">
          <ProfileQuickActions
            hideViewProfile
            profile={forProfile}
            pendingPaymentsByFestival={pendingPaymentsByFestival}
          />
        </div>
        <PublicProfile profile={forProfile} title="Perfil de Usuario" />
        <PrivateProfile profile={forProfile} />
      </div>
    </div>
  );
}
