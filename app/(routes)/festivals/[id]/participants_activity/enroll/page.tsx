import ActivityDetails from "@/app/(routes)/festivals/[id]/participants_activity/enroll/activity-details";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function Page() {
  const festival = await getActiveFestival();
  const activity = festival?.festivalActivities.find(
    (activity) => activity.name === "Sticker-Print",
  );
  const user = await getCurrentUserProfile();

  if (!user) {
    return <div>No estás autenticado</div>;
  }

  if (!activity) {
    return (
      <div className="flex min-h-[70dvh] md:min-h-[50dvh] flex-col items-center justify-center bg-background px-4 text-center">
        <div className="mx-auto flex max-w-[500px] flex-col items-center justify-center space-y-6">
          <div className="relative h-40 w-40">
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-muted text-[120px] font-bold opacity-10">
              404
            </div>
            <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold">
              404
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">
              No se encontró la actividad
            </h1>
            <p className="text-muted-foreground">
              No se encontró la actividad Sticker-Print en el festival actual.
            </p>
          </div>
        </div>
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
