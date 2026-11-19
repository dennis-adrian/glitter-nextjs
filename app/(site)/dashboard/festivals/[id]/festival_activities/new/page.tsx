import { notFound } from "next/navigation";
import { z } from "zod";

import FestivalActivityForm from "@/app/components/festivals/festival_activities/forms/festival-activity-form";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

type NewFestivalActivityPageProps = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: NewFestivalActivityPageProps) {
  const validatedParams = ParamsSchema.safeParse(await params);
  if (!validatedParams.success) return notFound();

  const { id: festivalId } = validatedParams.data;
  const festival = await fetchBaseFestival(festivalId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:px-6">
      <div className="space-y-1">
        <PageBreadcrumbs
          labels={
            festival
              ? { [`/dashboard/festivals/${festivalId}`]: festival.name }
              : undefined
          }
        />
        <h1 className="text-2xl font-bold" data-installed-title="">
          Nueva actividad
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Configurá quiénes participan, los cupos y los plazos de la actividad.
      </p>
      <FestivalActivityForm festivalId={festivalId} />
    </div>
  );
}
