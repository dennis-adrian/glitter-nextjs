import { Button } from "@/app/components/ui/button";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import Link from "next/link";

export function ReserveStandCard() {
  return (
    <BaseCard
      title="¡Reserva tu espacio!"
      content={
        <p>
          ¡Felicidades! Fuiste aceptado para participar de la siguiente versión
          de Glitter. Reserva tu espacio pulsando el botón
        </p>
      }
      footer={
        <div className="flex justify-center w-full">
          <Button>
            <Link href="/next_event">¡Quiero reservar!</Link>
          </Button>
        </div>
      }
    />
  );
}
