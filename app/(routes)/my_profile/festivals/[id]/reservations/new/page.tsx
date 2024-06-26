import ClientMap from "@/app/components/festivals/client-map";
import FestivalSkeleton from "@/app/components/festivals/festival-skeleton";
import { Badge } from "@/app/components/ui/badge";
import {
  fetchAvailableArtistsInFestival,
  fetchBaseFestival,
  fetchFestivalWithDates,
} from "@/app/data/festivals/actions";
import { fetchFestivalSectorsByUserCategory } from "@/app/lib/festival_sectors/actions";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await getCurrentUserProfile();
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  const festival = await fetchBaseFestival(parseInt(params.id));
  if (!festival) notFound();

  const sectors = await fetchFestivalSectorsByUserCategory(
    festival.id,
    profile!.category,
  );

  const acceptedArtists = await fetchAvailableArtistsInFestival(festival.id);

  return (
    <div className="container p-4 md:p-6">
      {sectors.length === 0 ? (
        <div className="text-muted-foreground flex justify-center">
          No tienes sectores habilitados para este festival
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sectors.map((sector) => {
            const sectorCategories = getFestivalSectorAllowedCategories(sector);

            return (
              <Suspense key={sector.id} fallback={<FestivalSkeleton />}>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-col gap-2 my-4 self-start">
                    <h3 className="font-semibold text-xl">{sector.name}</h3>
                    {sectorCategories.length > 0 && (
                      <div className="flex gap-2 items-center">
                        {sectorCategories.map((category) => (
                          <Badge key={category} variant="outline">
                            {category}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mx-auto">
                    <ClientMap
                      artists={acceptedArtists}
                      imageSrc={sector.mapUrl}
                      festival={festival}
                      profile={profile!}
                      stands={sector.stands}
                    />
                  </div>
                  <p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4 max-w-[400px]">
                    El plano muestra las ubicaciones y la distribución
                    confirmada de los stands. Las medidas y proporciones de
                    todos los elementos son estimadas y se utilizan de manera
                    orientativa.
                  </p>
                </div>
              </Suspense>
            );
          })}
        </div>
      )}
    </div>
  );
}
