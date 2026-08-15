import { Metadata } from "next";
import { z } from "zod";
import { notFound } from "next/navigation";

import FestivalNavMap from "@/app/components/maps/festival-nav/festival-nav-map";
import { CouponProof } from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import {
  fetchBaseFestival,
  fetchFestivalActivitiesByFestivalId,
} from "@/app/lib/festivals/actions";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";
import {
  emptyStandActivityUserIds,
  isStandActivityFilter,
} from "@/app/lib/maps/stand-filters";

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

  const activityUserIds = emptyStandActivityUserIds();
  const couponBookProofs: Record<number, CouponProof[]> = {};

  for (const activity of publicActivities) {
    if (!isStandActivityFilter(activity.type)) continue;

    for (const detail of activity.details) {
      for (const participant of detail.participants) {
        if (participant.removedAt != null) continue;

        const approvedProofs = participant.proofs.filter(
          (proof) => proof.proofStatus === "approved",
        );
        if (approvedProofs.length === 0) continue;

        const userId = participant.user.id;
        activityUserIds[activity.type].add(userId);

        if (activity.type === "coupon_book") {
          couponBookProofs[userId] ??= [];
          couponBookProofs[userId].push(
            ...approvedProofs.map((proof) => ({
              promoHighlight: proof.promoHighlight,
              promoDescription: proof.promoDescription,
              promoConditions: proof.promoConditions,
            })),
          );
        }
      }
    }
  }

  return (
    <FestivalNavMap
      festivalName={festival.name}
      sectors={sectors}
      activityUserIds={activityUserIds}
      couponBookProofs={couponBookProofs}
      activityTypes={publicActivities.map((activity) => activity.type)}
    />
  );
}
