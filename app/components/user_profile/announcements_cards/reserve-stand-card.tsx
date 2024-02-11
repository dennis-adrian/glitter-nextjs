"use client";

import { RedirectButton } from "@/components/redirect-button";

import BaseCard from "@/components/user_profile/announcements_cards/base-card";

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
          <RedirectButton href="/next_event">¡Quiero reservar!</RedirectButton>
        </div>
      }
    />
  );
}
