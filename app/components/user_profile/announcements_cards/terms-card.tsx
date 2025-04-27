"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { Festival } from "@/app/data/festivals/definitions";
import { getFestivalCategories } from "@/app/lib/festivals/utils";
import { RedirectButton } from "@/components/redirect-button";

import BaseCard from "@/components/user_profile/announcements_cards/base-card";
import { ArrowRightIcon } from "lucide-react";

type TermsCardProps = {
  festival: Festival;
  profile: ProfileType;
};

export function TermsCard(props: TermsCardProps) {
  const festivalCategories = getFestivalCategories(props.festival);
  if (
    props.profile.category &&
    !festivalCategories.includes(props.profile.category)
  ) {
    return null;
  }

  return (
    <BaseCard
      content={
        <p>
          Se acerca <b>{props.festival.name}</b>. Leé y aceptá los términos y
          condiciones para participar.
        </p>
      }
      footer={
        <RedirectButton
          className="text-amber-900 underline"
          variant="link"
          size="sm"
          href={`/profiles/${props.profile.id}/festivals/${props.festival.id}/terms`}
        >
          Leer términos y condiciones
          <ArrowRightIcon className="ml- w-4 h-4" />
        </RedirectButton>
      }
    />
  );
}
