import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import FestivalActivityForm from "@/app/components/festivals/festival_activities/forms/festival-activity-form";

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
        <h1 className="text-2xl font-bold">Nueva actividad</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Configurá quiénes participan, los cupos y los plazos de la actividad.
      </p>
      <FestivalActivityForm festivalId={festivalId} />
    </div>
  );
}
