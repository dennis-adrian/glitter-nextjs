import { StandBase } from "@/app/api/stands/actions";
import { RedirectButton } from "@/app/components/redirect-button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";

export function ReservedStandCard({ stand }: { stand: StandBase }) {
  return (
    <BaseCard
      title="¡Lo Lograste 🥳!"
      content={
        <div>
          Reservaste el espacio{" "}
          <strong>
            {stand.label}
            {stand.standNumber}
          </strong>{" "}
          para el próximo evento
          <div className="font-bold text-accent mb-3">¡Nos vemos ahí!</div>
          También puedes explorar a los demás artistas que estarán presentes
        </div>
      }
      footer={
        <div className="flex justify-center w-full">
          <RedirectButton variant="secondary" href="/next_event">
            ¡Ir al mapa!
          </RedirectButton>
        </div>
      }
    />
  );
}
