import { ProfileType } from "@/app/api/users/definitions";
import ParticipationForm from "./participation-form";
import BaseCard from "./base-card";
import { FestivalBase } from "@/api/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";

export default async function ParticipationCard({
  profile,
  festival,
}: {
  festival: FestivalBase;
  profile: ProfileType;
}) {
  return (
    <BaseCard
      title={`${festival.name} Se Acerca`}
      content={
        <p>
          La siguiente versión de <strong>Glitter</strong> será el{" "}
          {getFestivalDateLabel(festival)}. Para reservar tu espacio haz click
          en el botón
        </p>
      }
      footer={
        <ParticipationForm userId={profile.id} festivalId={festival.id} />
      }
    />
  );
}
