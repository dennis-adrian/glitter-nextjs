"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { Festival } from "@/app/data/festivals/definitions";
import { RedirectButton } from "@/components/redirect-button";

import BaseCard from "@/components/user_profile/announcements_cards/base-card";
import { ArrowRightIcon } from "lucide-react";

type TermsCardProps = {
  festival: Festival;
  profile: ProfileType;
};

export function TermsCard(props: TermsCardProps) {
  return (
    <BaseCard
      content={
        <p>
          Se viene un nuevo festival 🥳🎉 Lee los términos y condiciones para
          reservar tu espacio.
        </p>
      }
      footer={
        <RedirectButton
          size="sm"
          href={`/profiles/${props.profile.id}/festivals/${props.festival.id}/terms`}
        >
          Leer términos y condiciones
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
