import { RedirectButton } from "@/app/components/redirect-button";
import { ArrowUpRightIcon } from "lucide-react";

type PendingPaymentBannerProps = {
  profileId: number;
  festivalId: number;
  reservationId: number;
};

export default function PendingPaymentBanner({
  profileId,
  festivalId,
  reservationId,
}: PendingPaymentBannerProps) {
  return (
    <div className="sticky top-0 z-10 bg-white pt-3 w-full">
      <div className="border p-3 rounded-lg drop-shadow-lg bg-card">
        <div className="flex flex-wrap md:flex-row gap-4 justify-center items-center text-center md:text-left">
          <span>
            Tienes un pago pendiente. Puedes realizarlo dando clic en al botón
          </span>
          <RedirectButton
            size="sm"
            href={`/profiles/${profileId}/festivals/${festivalId}/reservations/${reservationId}/payments`}
          >
            Realizar pago
            <ArrowUpRightIcon className="ml-2 w-4 h-4" />
          </RedirectButton>
        </div>
      </div>
    </div>
  );
}
