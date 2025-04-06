import { StandBase } from "@/app/api/stands/actions";
import { ReservationStatus } from "@/app/api/user_requests/actions";
import { RedirectButton } from "@/app/components/redirect-button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import { FileSpreadsheetIcon, MapIcon } from "lucide-react";

export function ReservedStandCard({
  stand,
  festival,
  reservationStatus,
  profile,
}: {
  stand: StandBase;
  festival: FestivalBase;
  reservationStatus: ReservationStatus;
  profile: BaseProfile;
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
        <div className="flex gap-0 items-center flex-col-reverse md:flex-col">
          <RedirectButton
            variant="link"
            size="sm"
            href={`/profiles/${profile.id}/festivals/${stand.festivalId}/terms`}
          >
            Leer términos y condiciones
            <FileSpreadsheetIcon className="ml-2 w-4 h-4" />
          </RedirectButton>
          <RedirectButton
            variant="link"
            size="sm"
            href={`/festivals/${stand.festivalId}?tab=sectors`}
          >
            Ir al mapa
            <MapIcon className="ml-2 w-4 h-4" />
          </RedirectButton>
        </div>
      }
    />
  );
}
