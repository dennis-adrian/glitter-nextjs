"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { Festival } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { RedirectButton } from "@/components/redirect-button";

import BaseCard from "@/components/user_profile/announcements_cards/base-card";
import { ArrowRightIcon } from "lucide-react";
import { DateTime } from "luxon";

type ReserveStandCardProps = {
  festival: Festival;
  profile: ProfileType;
};

export function ReserveStandCard(props: ReserveStandCardProps) {
  const reservationsStartDate = formatDate(
    props.festival.reservationsStartDate,
  );
  if (reservationsStartDate.toJSDate() > new Date()) {
    return (
      <BaseCard
        content={
          <p className="text-center">
            Podrás hacer tu reserva el{" "}
            {reservationsStartDate.toLocaleString(DateTime.DATE_FULL)} a partir
            de las{" "}
            {reservationsStartDate.toLocaleString(DateTime.TIME_24_SIMPLE)}
          </p>
        }
      />
    );
  }

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
