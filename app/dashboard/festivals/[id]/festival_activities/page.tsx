import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

type FestivalActivitiesPageProps = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: FestivalActivitiesPageProps) {
  const validatedParams = ParamsSchema.safeParse(await params);
  if (!validatedParams.success) {
    return notFound();
  }

  const { id: festivalId } = validatedParams.data;

  const festival = await fetchFullFestivalById(festivalId);

  if (!festival) {
    return notFound();
  }

  const activities = festival.festivalActivities;
  const firstActivity = activities[0];

  if (!firstActivity) {
    return notFound();
  }

  return (
    <div className="container p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">
        Actividades del festival
      </h1>
      <h2 className="mb-2 text-xl font-bold md:text-2xl">
        Sticker-Print - Festival 2025
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {firstActivity.details.map((detail) => {
          return (
            <div
              key={detail.id}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {detail.imageUrl && (
                <Image
                  src={detail.imageUrl}
                  alt={`Sticker-Print ${detail.id}`}
                  width={320}
                  height={480}
                />
              )}
              <div>
                <h3 className="text-lg font-semibold">Participantes</h3>
                <ol className="list-decimal list-inside">
                  {detail.participants.map((participant) => (
                    <li key={participant.id}>{participant.user.displayName}</li>
                  ))}
                </ol>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
