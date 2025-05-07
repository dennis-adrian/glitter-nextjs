"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { Festival } from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { RedirectButton } from "@/components/redirect-button";

import BaseCard from "@/components/user_profile/announcements_cards/base-card";
import { ArrowRightIcon, NewspaperIcon } from "lucide-react";
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
            Podrás hacer tu reserva la noche del{" "}
            {reservationsStartDate.toLocaleString(DateTime.DATE_SHORT)}. De
            momento podés leer los términos y condiciones nuevamente.
          </p>
        }
        footer={
          <RedirectButton
            size="sm"
            variant="link"
            className="text-amber-900 underline"
            href={`/profiles/${props.profile.id}/festivals/${props.festival.id}/terms`}
          >
            Términos y condiciones
            <NewspaperIcon className="ml-2 w-4 h-4" />
          </RedirectButton>
        }
      />
    );
  }

  return (
    <BaseCard
      content={
        <p>
          No te quedés sin participar en {props.festival.name}. Hacé tu reserva
          ahora.
        </p>
      }
      footer={
        <RedirectButton
          size="sm"
          variant="link"
          className="text-amber-900 underline"
          href={`/profiles/${props.profile.id}/festivals/${props.festival.id}/reservations/new`}
        >
          Reservar espacio
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
