import { Metadata } from "next";
import { z } from "zod";
import { notFound } from "next/navigation";

import FestivalNavMap from "@/app/components/maps/festival-nav/festival-nav-map";
import {
  fetchBaseFestival,
  fetchFestivalActivitiesByFestivalId,
} from "@/app/lib/festivals/actions";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";
import { getMapActivityData } from "@/app/lib/maps/activity-data";

export const metadata: Metadata = {
  title: "Mapa del festival",
  description: "Productora Glitter",
};

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function FestivalMapPage(props: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  const { id } = validatedParams.data;

  const [festival, sectors, activities] = await Promise.all([
    fetchBaseFestival(id),
    fetchFestivalSectors(id),
    fetchFestivalActivitiesByFestivalId(id),
  ]);

  if (!festival) notFound();

  const publicActivities = activities.filter(
    (activity) => activity.accessLevel === "public",
  );

  const { activityUserIds, couponBookProofs, activityTypes } =
    getMapActivityData(publicActivities);

  return (
    <FestivalNavMap
      festivalName={festival.name}
      sectors={sectors}
      activityUserIds={activityUserIds}
      couponBookProofs={couponBookProofs}
      activityTypes={activityTypes}
    />
  );
}
