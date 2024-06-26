import { SignedIn } from "@clerk/nextjs";

import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import PublicProfile from "@/components/user_profile/public_profile/profile";
import PrivateProfile from "@/app/components/user_profile/private_profile/overview";
import { fetchLatestInvoiceByProfileId } from "@/app/data/invoices/actions";
import { RedirectButton } from "@/app/components/redirect-button";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function UserProfile() {
  const profile = await getCurrentUserProfile();
  if (!profile) return null;

  const latestInvoice = await fetchLatestInvoiceByProfileId(profile.id);
  return (
    <div className="mx-auto max-w-screen-lg p-3 md:p-6">
      <SignedIn>
        <div className="flex flex-col gap-4">
          <AnnouncementCard profile={profile} />
          <PublicProfile profile={profile} />
          <PrivateProfile profile={profile} />
        </div>
        {latestInvoice && latestInvoice.status === "pending" && (
          <div className="sticky bottom-0 border rounded-3xl min-w-80 md:min-w-[400px] bg-card p-4 mt-4">
            <div className="flex flex-col md:flex-row gap-2 justify-between items-center text-center md:text-left">
              <span>
                Tienes un pago pendiente. Puedes realizarlo dando clic en al
                botón
              </span>
              <RedirectButton href={`/profiles/${profile.id}/payments/latest`}>
                Realizar pago
              </RedirectButton>
            </div>
          </div>
        )}
      </SignedIn>
    </div>
  );
}
