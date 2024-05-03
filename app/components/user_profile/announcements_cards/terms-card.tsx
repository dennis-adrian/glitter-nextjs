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
          Se viene una nueva versión del festival 🥳🎉 Lee los términos y
          condiciones para reservar tu espacio.
        </p>
      }
      footer={
        <RedirectButton
          size="sm"
          href={`/festivals/${props.festival.id}?category=${props.profile.category}&terms=true`}
        >
          Leer términos y condiciones
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
