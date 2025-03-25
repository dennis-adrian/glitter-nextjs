import { StandBase } from "@/app/api/stands/actions";
import { ReservationStatus } from "@/app/api/user_requests/actions";
import { RedirectButton } from "@/app/components/redirect-button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { ArrowRightIcon } from "lucide-react";

export function ReservedStandCard({
  stand,
  festival,
  reservationStatus,
}: {
  stand: StandBase;
  festival: FestivalBase;
  reservationStatus: ReservationStatus;
}) {
  return (
    <BaseCard
      content={
        reservationStatus === "accepted" ? (
          <div>
            Tu participación en el <strong>{festival.name}</strong> está
            confirmada. Tu espacio es el{" "}
            <strong>
              {stand.label}
              {stand.standNumber}
            </strong>{" "}
          </div>
        ) : (
          <div>
            Reservaste el espacio{" "}
            <strong>
              {stand.label}
              {stand.standNumber}
            </strong>{" "}
            para {festival.name}. Pronto recibirás un correo electrónico con la
            confirmación de tu reserva.
          </div>
        )
      }
      footer={
        <RedirectButton
          variant="link"
          className="text-amber-900 underline"
          size="sm"
          href={`/festivals/${festival.id}?tab=sectors`}
        >
          Ir al mapa
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
