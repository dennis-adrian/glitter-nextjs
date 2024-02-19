"use client";

import { RedirectButton } from "@/components/redirect-button";

import BaseCard from "@/components/user_profile/announcements_cards/base-card";
import { ArrowRightIcon } from "lucide-react";

export function ReserveStandCard() {
  return (
    <BaseCard
      className="bg-gradient-to-r from-pink-500 to-rose-500"
      content={
        <p>
          ¡Felicidades! Fuiste aceptado para participar de la siguiente versión
          de Glitter. Reserva tu espacio pulsando el botón
        </p>
      }
      footer={
        <RedirectButton variant="secondary" size="sm" href="/next_event">
          Ir a reservar espacio
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
