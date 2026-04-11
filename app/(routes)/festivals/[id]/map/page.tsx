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

	const couponBookActivity = activities.find((a) => a.type === "coupon_book");
	const couponBookUserIds: number[] = [];
	const couponBookProofs: Record<number, CouponProof[]> = {};

	for (const detail of couponBookActivity?.details ?? []) {
		for (const participant of detail.participants) {
			const approvedProofs = participant.proofs.filter(
				(p) => p.proofStatus === "approved",
			);
			if (approvedProofs.length > 0) {
				const userId = participant.user.id;
				if (!couponBookProofs[userId]) {
					couponBookUserIds.push(userId);
					couponBookProofs[userId] = [];
				}
				couponBookProofs[userId].push(
					...approvedProofs.map((p) => ({
						promoHighlight: p.promoHighlight,
						promoDescription: p.promoDescription,
						promoConditions: p.promoConditions,
					})),
				);
			}
		}
	}

	return (
		<FestivalNavMap
			festivalName={festival.name}
			sectors={sectors}
			couponBookUserIds={couponBookUserIds}
			couponBookProofs={couponBookProofs}
		/>
	);
}
