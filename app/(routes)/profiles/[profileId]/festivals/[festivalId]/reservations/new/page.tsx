import ClientMap from "@/app/components/festivals/client-map";
import FestivalSkeleton from "@/app/components/festivals/festival-skeleton";
import FestivalSectorTitle from "@/app/components/festivals/sectors/sector-title";
import Loader from "@/app/components/loader";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import NewReservationPage from "@/app/components/pages/profiles/festivals/new-reservation";
import {
  fetchAvailableArtistsInFestival,
  fetchBaseFestival,
} from "@/app/data/festivals/actions";
import { fetchFestivalSectorsByUserCategory } from "@/app/lib/festival_sectors/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
});

export default async function Page({
  params,
}: {
  params: { festivalId: string; profileId: string };
}) {
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <Suspense fallback={<Loader />}>
      <NewReservationPage
        profileId={validatedParams.data.profileId}
        festivalId={validatedParams.data.festivalId}
      />
    </Suspense>
  );
}
