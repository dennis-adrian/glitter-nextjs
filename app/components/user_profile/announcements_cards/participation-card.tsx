import { ProfileType } from "@/app/api/users/definitions";
import ParticipationForm from "./participation-form";
import BaseCard from "./base-card";
import { Festival } from "@/app/api/festivals/actions";

export default async function ParticipationCard({
  profile,
  festival,
}: {
  festival: Festival;
  profile: ProfileType;
}) {
  const startDateDay = festival.startDate.getDate() + 1;
  const endDateDay = festival.endDate.getDate() + 1;
  const startDateMonth = festival.startDate.toLocaleString("es-ES", {
    month: "long",
  });

  return (
    <BaseCard
      title={`${festival.name} Se Acerca`}
      content={
        <p>
          La siguiente versión de <strong>Glitter</strong> será el{" "}
          {startDateDay} y {endDateDay} de {startDateMonth}. Para reservar tu
          espacio haz click en el botón
        </p>
      }
      footer={
        <ParticipationForm userId={profile.id} festivalId={festival.id} />
      }
    />
  );
}
