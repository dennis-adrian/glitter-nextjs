import { StandBase } from "@/app/api/stands/actions";
import { RedirectButton } from "@/app/components/redirect-button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import { ArrowRightIcon } from "lucide-react";

export function ReservedStandCard({ stand }: { stand: StandBase }) {
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
        <RedirectButton variant="secondary" size="sm" href="/next_event">
          Ir al mapa
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
