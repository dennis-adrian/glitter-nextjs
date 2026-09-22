import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import FestivalActivityForm from "@/app/components/festivals/festival_activities/forms/festival-activity-form";

const ParamsSchema = z.object({
  id: z.coerce.number(),
  activityId: z.coerce.number(),
});

type EditFestivalActivityPageProps = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: EditFestivalActivityPageProps) {
  const validatedParams = ParamsSchema.safeParse(await params);
  if (!validatedParams.success) return notFound();

  const { id: festivalId, activityId } = validatedParams.data;

  const activity = await fetchFestivalActivity(activityId);
  if (!activity || activity.festivalId !== festivalId) return notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:px-6">
      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/festivals/${festivalId}/festival_activities`}
          aria-label="Volver a las actividades"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold">Editar actividad</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Configurá quiénes participan, los cupos y los plazos de la actividad.
      </p>
      <FestivalActivityForm festivalId={festivalId} activity={activity} />
    </div>
  );
}
