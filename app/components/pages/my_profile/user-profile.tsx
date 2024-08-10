import { SignedIn } from "@clerk/nextjs";

import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import PublicProfile from "@/components/user_profile/public_profile/profile";
import PrivateProfile from "@/app/components/user_profile/private_profile/overview";
import { fetchLatestInvoiceByProfileId } from "@/app/data/invoices/actions";
import { RedirectButton } from "@/app/components/redirect-button";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { ArrowUpRightIcon } from "lucide-react";

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
            <div className="sticky top-0 z-10 bg-white pt-3 w-full">
              <div className="border p-3 rounded-lg drop-shadow-lg bg-card">
                <div className="flex flex-wrap md:flex-row gap-4 justify-center items-center text-center md:text-left">
                  <span>
                    Tienes un pago pendiente. Puedes realizarlo dando clic en al
                    botón
                  </span>
                  <RedirectButton
                    size="sm"
                    href={`/profiles/${profile.id}/festivals/${latestInvoice.reservation.festivalId}/reservations/${latestInvoice.reservationId}/payments`}
                  >
                    Realizar pago
                    <ArrowUpRightIcon className="ml-2 w-4 h-4" />
                  </RedirectButton>
                </div>
              </div>
            </div>
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
