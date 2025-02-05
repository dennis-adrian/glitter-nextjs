import { ProfileType } from "@/app/api/users/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { fetchLatestInvoiceByProfileId } from "@/app/data/invoices/actions";
import { ArrowUpRightIcon } from "lucide-react";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";

type UserProfileBannerProps = {
  profile: ProfileType;
};

export default async function UserProfileBanner({
  profile,
}: UserProfileBannerProps) {
  const latestInvoice = await fetchLatestInvoiceByProfileId(profile.id);
  const hasPendingPayment =
    latestInvoice?.status === "pending" &&
    latestInvoice.reservation.status === "pending";

  if (!hasPendingPayment) {
    if (profile.status !== "banned") {
      return <AnnouncementCard profile={profile} />;
    } else {
      return null;
    }
  }

  const {
    reservation: { festivalId },
    reservationId,
  } = latestInvoice;

  return (
    <div className="sticky top-0 z-10 bg-white pt-3 w-full">
      <div className="border p-3 rounded-lg drop-shadow-lg bg-card">
        <div className="flex flex-wrap md:flex-row gap-4 justify-center items-center text-center md:text-left">
          <span>
            Tienes un pago pendiente. Puedes realizarlo dando clic en al botón
          </span>
          <RedirectButton
            size="sm"
            href={`/profiles/${profile.id}/festivals/${festivalId}/reservations/${reservationId}/payments`}
          >
            Realizar pago
            <ArrowUpRightIcon className="ml-2 w-4 h-4" />
          </RedirectButton>
        </div>
      </div>
    </div>
  );
}
