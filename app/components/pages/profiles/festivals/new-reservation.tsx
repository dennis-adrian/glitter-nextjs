import ClientMap from "@/app/components/festivals/client-map";
import FestivalSkeleton from "@/app/components/festivals/festival-skeleton";
import FestivalSectorTitle from "@/app/components/festivals/sectors/sector-title";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import {
  fetchAvailableArtistsInFestival,
  fetchBaseFestival,
} from "@/app/data/festivals/actions";
import { fetchFestivalSectorsByUserCategory } from "@/app/lib/festival_sectors/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type NewReservationPageProps = {
  profileId: number;
  festivalId: number;
};
export default async function NewReservationPage(
  props: NewReservationPageProps,
) {
  const profile = await getCurrentUserProfile();
  await protectRoute(profile || undefined, props.profileId);

  const festival = await fetchBaseFestival(props.festivalId);
  if (!festival) notFound();

  const inFestival = isProfileInFestival(festival.id, profile);
  if (!inFestival) {
    return (
      <div className="text-muted-foreground flex pt-8 justify-center">
        No estás habilitado para participar en este evento
      </div>
    );
  }

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
            return (
              <Suspense key={sector.id} fallback={<FestivalSkeleton />}>
                <div className="flex flex-col items-center gap-2">
                  <FestivalSectorTitle sector={sector} />
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
