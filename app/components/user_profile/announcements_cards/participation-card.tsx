import { UserProfileType } from "@/app/api/users/actions";
import ParticipationForm from "./participation-form";
import BaseCard from "./base-card";
import { Festival } from "@/app/api/festivals/actions";

export default async function ParticipationCard({
  profile,
  festival,
}: {
  festival: Festival;
  profile: UserProfileType;
}) {
  return (
    <BaseCard
      title={`${festival.name} Se Acerca`}
      content={
        <p>
          La siguiente versión de Glitter será el 2 y 3 de marzo. Si deseas
          participar postula dándole click al botón.
        </p>
      }
      footer={
        <ParticipationForm userId={profile.id} festivalId={festival.id} />
      }
    />
  );
}
