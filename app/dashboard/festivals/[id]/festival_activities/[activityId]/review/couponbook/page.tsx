import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import CouponBookPreviewClient from "./preview-client";
import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import { buildCouponBookVariants } from "@/app/lib/festival_activites/coupon-book-builder";
import { fetchParticipationPreviewData } from "@/app/lib/festival_activites/actions";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type CouponBookReviewPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function CouponBookReviewPage({
	params,
}: CouponBookReviewPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const { id, activityId } = validatedParams.data;
	const activity = await fetchFestivalActivityForReview(id, activityId);
	if (!activity) return notFound();

	const baseVariants = buildCouponBookVariants(activity);
	const variants = await Promise.all(
		baseVariants.map(async (variant) => {
			const entries = await Promise.all(
				variant.entries.map(async (entry) => {
					if (!entry.participationId) return entry;
					const previewData = await fetchParticipationPreviewData(
						entry.participationId,
					);
					if (!previewData) return entry;
					return {
						...entry,
						imageUrl: previewData.imageUrl,
						participantName: previewData.participantName ?? entry.participantName,
						standLabels: previewData.standLabels,
						sectorName: previewData.sectorName,
					};
				}),
			);
			return { ...variant, entries };
		}),
	);

	return (
		<div className="container p-3 md:p-6 space-y-4">
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<div>
					<h1 className="text-lg md:text-xl font-bold">
						Cuponera imprimible - {activity.name}
					</h1>
					<p className="text-sm text-muted-foreground">
						Vista previa fiel a impresión (21.59cm x 16.5cm)
					</p>
				</div>
				<Link
					href={`../`}
					className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground"
				>
					Volver a revisión
				</Link>
			</div>

			<CouponBookPreviewClient
				festivalId={id}
				activityId={activityId}
				activityName={activity.name}
				variants={variants}
			/>
		</div>
	);
}
