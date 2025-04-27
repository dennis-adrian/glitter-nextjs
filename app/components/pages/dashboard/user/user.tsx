import { fetchUserProfileById } from "@/app/api/users/actions";
import { notFound } from "next/navigation";
import PrivateProfile from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import ProfileQuickActions from "@/app/components/user_profile/public_profile/quick-actions";
import { Button } from "@/app/components/ui/button";
import { CogIcon } from "lucide-react";
import { fetchLatestInvoiceByProfileId } from "@/app/data/invoices/actions";
import UserProfileBanner from "@/app/components/users/user-profile-banner";
import FestivalActivityBanner from "@/app/components/pages/my_profile/festival-activity-banner";

type DashboardUserPageProps = {
  profileId: number;
};
export default async function DashboardUserPage(props: DashboardUserPageProps) {
  const forProfile = await fetchUserProfileById(props.profileId);
  if (!forProfile) return notFound();

  const latestInvoice = await fetchLatestInvoiceByProfileId(props.profileId);
  const hasPendingPayment =
    latestInvoice?.status === "pending" &&
    latestInvoice.reservation.status === "pending";

  return (
    <div className="mx-auto max-w-screen-lg p-3 md:p-6">
      <div className="flex flex-col gap-4">
        {hasPendingPayment ? (
          <UserProfileBanner profile={forProfile} />
        ) : (
          <>
            <FestivalActivityBanner profile={forProfile} />
            {forProfile.status !== "banned" && (
              <AnnouncementCard profile={forProfile} />
            )}
          </>
        )}
        <div className="self-end">
          <ProfileQuickActions hideViewProfile profile={forProfile}>
            <Button variant="outline" size="icon">
              <CogIcon className="h-6 w-6" />
            </Button>
          </ProfileQuickActions>
        </div>
        <PublicProfile profile={forProfile} title="Perfil de Usuario" />
        <PrivateProfile profile={forProfile} />
      </div>
    </div>
  );
}
