import { UserProfileType } from "@/app/api/users/actions";
import { fetchActiveFestival } from "@/app/api/festivals/actions";
import ParticipationForm from "./participation-form";
import BaseCard from "./base-card";

export default async function ParticipationCard({
  profile,
}: {
  profile: UserProfileType;
}) {
  const festival = await fetchActiveFestival();
  if (!(profile && festival)) return null;

  return (
    <BaseCard
      title="Glitter Vol. 2 Se Acerca"
      content={
        <>
          La siguiente versión de Glitter se viene el 2 y 3 de marzo. Si quieres
          participar primero necesitas ser un artista parte de la comunidad de
          Glitter
        </>
      }
      footer={
        <ParticipationForm userId={profile.id} festivalId={festival.id} />
      }
    />
  );
}
