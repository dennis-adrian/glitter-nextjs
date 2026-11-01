import { notFound } from "next/navigation";
import { z } from "zod";

import { fetchFestivalActivityForStaff } from "@/app/lib/festival_activites/queries";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import FestivalActivityForm from "@/app/components/festivals/festival_activities/forms/festival-activity-form";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";

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

  const [activity, festival] = await Promise.all([
    fetchFestivalActivityForStaff(activityId),
    fetchBaseFestival(festivalId),
  ]);
  if (!activity || activity.festivalId !== festivalId) return notFound();

  const festivalHref = `/dashboard/festivals/${festivalId}`;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:px-6">
      <div className="space-y-1">
        <PageBreadcrumbs
          labels={{
            ...(festival ? { [festivalHref]: festival.name } : {}),
            [`${festivalHref}/festival_activities/${activity.id}`]:
              activity.name,
          }}
        />
        <h1 className="text-2xl font-bold" data-installed-title="">
          Editar actividad
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Configurá quiénes participan, los cupos y los plazos de la actividad.
      </p>
      <FestivalActivityForm festivalId={festivalId} activity={activity} />
    </div>
  );
}
