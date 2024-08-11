import { SignedIn } from "@clerk/nextjs";

import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import PublicProfile from "@/components/user_profile/public_profile/profile";
import PrivateProfile from "@/app/components/user_profile/private_profile/overview";
import { fetchLatestInvoiceByProfileId } from "@/app/data/invoices/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import PendingPaymentBanner from "@/app/components/users/pending-payment-banner";

export default async function MyProfilePage() {
  const profile = await getCurrentUserProfile();
  if (!profile) return null;

  const latestInvoice = await fetchLatestInvoiceByProfileId(profile.id);
  const hasPendingPayment =
    latestInvoice?.status === "pending" &&
    latestInvoice.reservation.status === "pending";

  return (
    <div className="mx-auto max-w-screen-lg p-3 md:p-6">
      <div className="flex flex-col gap-4">
        <SignedIn>
          {hasPendingPayment ? (
            <PendingPaymentBanner
              profileId={profile.id}
              festivalId={latestInvoice.reservation.festivalId}
              reservationId={latestInvoice.reservationId}
            />
          ) : (
            profile.status !== "banned" && (
              <AnnouncementCard profile={profile} />
            )
          )}
          <PublicProfile profile={profile} />
          <PrivateProfile profile={profile} />
        </SignedIn>
      </div>
    </div>
  );
}
