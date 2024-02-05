import { StandBase } from "@/app/api/stands/actions";
import { Button } from "@/app/components/ui/button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import Link from "next/link";

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
          <Button>
            <Link href="/next_event">¡Ir al mapa!</Link>
          </Button>
        </div>
      }
    />
  );
}
