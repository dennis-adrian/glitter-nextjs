import SectorReservationSkeleton from "@/app/components/festivals/reservations/sector-reservation-skeleton";
import MapReservationPage from "@/app/components/pages/profiles/festivals/map-reservation";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
});

export default async function Page(
  props: {
    params: Promise<{ festivalId: string; profileId: string }>;
  }
) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <Suspense fallback={<SectorReservationSkeleton />}>
      <MapReservationPage
        profileId={validatedParams.data.profileId}
        festivalId={validatedParams.data.festivalId}
      />
    </Suspense>
  );
}
