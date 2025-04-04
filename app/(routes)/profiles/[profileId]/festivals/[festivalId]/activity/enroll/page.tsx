import ActivityDetails from "@/app/components/festivals/festival_activities/activity-details";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";
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
  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-3xl font-bold mb-2">Inscripción al Sticker-Print</h1>
      <p className="text-muted-foreground">
        Selecciona una imagen para elegir el diseño para participar en la
        actividad del Sticker-Print.
      </p>
      <ActivityDetails activity={activity} user={user} />
    </div>
  );
}
