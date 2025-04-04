import ActivityDetails from "@/app/components/festivals/festival_activities/activity-details";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";
import Image from "next/image";
import { notFound } from "next/navigation";

export default async function Page() {
  const festival = await getActiveFestival();
  const activity = festival?.festivalActivities.find(
    (activity) => activity.name === "Sticker-Print",
  );
  const user = await getCurrentUserProfile();
  if (!user) {
    return notFound();
  }

  if (!activity) {
    return notFound();
  }

  const now = DateTime.now();
  const startDate = DateTime.fromJSDate(activity.registrationStartDate);
  const endDate = DateTime.fromJSDate(activity.registrationEndDate);

  if (now < startDate || now > endDate) {
    return (
      <div className="container p-4 md:p-6">
        <h1 className="text-3xl font-bold mb-2">
          Inscripción al Sticker-Print
        </h1>
        <p className="text-muted-foreground">
          El registro para la actividad del Sticker-Print no está disponible en
          este momento.
        </p>
      </div>
    );
  }

  const enrolledDesign = activity.details.find((detail) =>
    detail.participants.some((participant) => participant.userId === user.id),
  );

  if (enrolledDesign) {
    return (
      <div className="container p-4 md:p-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">Sticker-Print</h1>
        <p className="">
          Muchas gracias por inscribirte a la actividad del Sticker-Print. Toma
          nota de los siguientes detalles:
        </p>
        <ul className="list-disc list-inside">
          <li>
            La posición en la que irá tu sticker en el sticker-print es la
            número{" "}
            <strong>
              {enrolledDesign.participants.findIndex(
                (participant) => participant.userId === user.id,
              ) + 1}
              .
            </strong>
          </li>
          <li>La medida de tu sticker tiene que ser de 4cm x 4cm.</li>
          <li>
            La cantidad minima de stickers para cumplir con la actividad es de
            40.
          </li>
          <li>El diseño que elegiste es el siguiente:</li>
        </ul>
        {enrolledDesign.imageUrl && (
          <div className="flex flex-col gap-1 justify-center items-center">
            <Image
              className="mx-auto mt-2 md:mt-4"
              src={enrolledDesign.imageUrl}
              alt={`Sticker Print ${enrolledDesign.id}`}
              width={300}
              height={480}
            />
            <p className="text-muted-foreground text-sm">
              {enrolledDesign.participants
                .map((participant) => {
                  const name = participant.user.displayName;
                  const position =
                    enrolledDesign.participants.findIndex(
                      (p) => p.userId === participant.userId,
                    ) + 1;

                  return `${position}. ${name}`;
                })
                .join(", ")}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-xl md:text-2xl font-bold mb-1">
        Inscripción al Sticker-Print
      </h1>
      <p className="text-muted-foreground text-sm md:text-base mb-2 md:mb-4">
        Selecciona una imagen para elegir el diseño para participar en la
        actividad del Sticker-Print.
      </p>
      <ActivityDetails activity={activity} user={user} />
    </div>
  );
}
