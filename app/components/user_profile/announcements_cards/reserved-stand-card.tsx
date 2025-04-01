import { StandBase } from "@/app/api/stands/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import { FileSpreadsheetIcon, MapIcon } from "lucide-react";

export function ReservedStandCard({
  stand,
  profile,
}: {
  stand: StandBase;
  profile: BaseProfile;
}) {
  return (
    <BaseCard
      content={
        <div>
          Reservaste el espacio{" "}
          <strong>
            {stand.label}
            {stand.standNumber}
          </strong>{" "}
          para el próximo evento. También puedes explorar a los demás artistas
          que estarán presentes
        </div>
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
