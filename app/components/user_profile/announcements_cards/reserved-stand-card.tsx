import { StandBase } from "@/app/api/stands/actions";
import { ReservationStatus } from "@/app/api/user_requests/actions";
import { RedirectButton } from "@/app/components/redirect-button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import { FileSpreadsheetIcon, MapIcon } from "lucide-react";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { formatStandLabel } from "@/app/lib/stands/helpers";

export function ReservedStandCard({
  stand,
  standLabel,
  festival,
  reservationStatus,
}: {
  /** Kept for the festival links; the text uses `standLabel`. */
  stand: StandBase;
  /**
   * What the reservation occupies. A full table holds two stands, and naming
   * only the one the participant picked first told them they had half of what
   * they booked.
   */
  standLabel?: string;
  festival: FestivalBase;
  reservationStatus: ReservationStatus;
}) {
  const label = standLabel || formatStandLabel(stand);
  return (
    <BaseCard
      content={
        reservationStatus === "accepted" ? (
          <div>
            Tu participación en el <strong>{festival.name}</strong> está
            confirmada. Tu espacio es el <strong>{label}</strong>{" "}
          </div>
        ) : (
          <div>
            Reservaste el espacio <strong>{label}</strong> para {festival.name}.
            Pronto recibirás un correo electrónico con la confirmación de tu
            reserva.
          </div>
        )
      }
      footer={
        <div className="flex gap-0 items-center flex-col-reverse md:flex-col">
          <RedirectButton
            className="text-amber-900 underline"
            variant="link"
            size="sm"
            href={`/festivals/${stand.festivalId}/terms`}
          >
            Leer términos y condiciones
            <FileSpreadsheetIcon className="ml-2 w-4 h-4" />
          </RedirectButton>
          <RedirectButton
            className="text-amber-900 underline"
            variant="link"
            size="sm"
            href={`/festivals/${stand.festivalId}#mapa`}
          >
            Ir al mapa
            <MapIcon className="ml-2 w-4 h-4" />
          </RedirectButton>
        </div>
      }
    />
  );
}
