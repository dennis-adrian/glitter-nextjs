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
              className="flex flex-col md:flex-row gap-3 justify-center items-center md:items-start md:justify-start p-3 border border-border rounded-md"
            >
              {detail.imageUrl && (
                <div className="relative w-48 h-64">
                  <Image
                    className="rounded-md object-cover"
                    src={detail.imageUrl}
                    alt={`Sticker-Print ${detail.id}`}
                    fill
                  />
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold my-3">Participantes</h3>
                <div className="flex flex-wrap gap-3 justify-center items-center">
                  {detail.participants.map((participant, index) => (
                    <div
                      key={participant.id}
                      className="flex flex-col justify-between items-center gap-2 text-muted-foreground text-sm"
                    >
                      <div className="relative w-20 h-20 md:w-32 md:h-32">
                        {participant.proofs.map((proof) => (
                          <Image
                            className="rounded-md object-cover"
                            key={proof.id}
                            src={proof.imageUrl}
                            alt={`Proof ${proof.id}`}
                            fill
                            sizes="(max-width: 768px) 5rem, 8rem"
                          />
                        ))}
                      </div>
                      <span
                        className="text-xs md:text-sm truncate max-w-full text-center"
                        style={{
                          fontSize:
                            (participant.user.displayName?.length || 0) > 15
                              ? "0.7rem"
                              : "0.875rem",
                        }}
                      >
                        #{index + 1} {participant.user.displayName || "Unknown"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
