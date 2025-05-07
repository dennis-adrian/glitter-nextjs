import { ProfileType } from "@/app/api/users/definitions";
import ParticipationForm from "./participation-form";
import BaseCard from "./base-card";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";

export default async function ParticipationCard({
  profile,
  festival,
}: {
  festival: FestivalWithDates;
  profile: ProfileType;
}) {
  return (
    <BaseCard
      className="bg-gradient-to-r from-purple-500 to-purple-900"
      content={
        <p>
          Nuestro siguiente evento será el {getFestivalDateLabel(festival)}.
          Para reservar tu espacio haz click en el botón
        </p>
      }
      footer={
        <ParticipationForm userId={profile.id} festivalId={festival.id} />
      }
    />
  );
}
