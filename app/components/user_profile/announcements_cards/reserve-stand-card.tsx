"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { Festival } from "@/app/data/festivals/definitions";
import { RedirectButton } from "@/components/redirect-button";

import BaseCard from "@/components/user_profile/announcements_cards/base-card";
import { ArrowRightIcon } from "lucide-react";

type ReserveStandCardProps = {
  festival: Festival;
  profile: ProfileType;
};

export function ReserveStandCard(props: ReserveStandCardProps) {
  return (
    <BaseCard
      content={
        <p>
          Ya puedes hacer tu reserva para la siguiente versión de Glitter.
          Reserva tu espacio pulsando el botón
        </p>
      }
      footer={
        <RedirectButton
          size="sm"
          href={`/profiles/${props.profile.id}/festivals/${props.festival.id}/reservations/new`}
        >
          Ir a reservar espacio
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
