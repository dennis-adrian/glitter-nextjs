import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import type { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
import { notFound } from "next/navigation";
import { z } from "zod";
import ActivityProofsTable from "../../activity-proofs-table";
import ExportProofsButton from "./export-proofs-button";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type ReviewPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: ReviewPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const activity = await fetchFestivalActivityForReview(
		validatedParams.data.id,
		validatedParams.data.activityId,
	);

	if (!activity) return notFound();

	const allParticipants = activity.details.flatMap((detail) =>
		detail.participants.map((p) => ({
			...p,
			detail: { ...detail, votes: [] } as ActivityDetailsWithParticipants,
			removedAt: p.removedAt,
		})),
	);

	const showExport =
		activity.proofType === "text" || activity.proofType === "both";

	const approvedPromos = showExport
		? allParticipants
				.filter((p) => p.proofs[0]?.proofStatus === "approved")
				.map((p) => ({
					name: p.user.displayName ?? "—",
					promoDescription: p.proofs[0]?.promoDescription ?? "",
					promoConditions: p.proofs[0]?.promoConditions ?? null,
				}))
		: [];

	return (
		<div className="container p-3 md:p-6 space-y-4">
			<div className="flex items-center justify-between gap-4 flex-wrap">
				<h1 className="text-lg md:text-xl font-bold">
					Revisión de pruebas — {activity.name}
				</h1>
				{showExport && <ExportProofsButton approvedPromos={approvedPromos} />}
			</div>

			<ActivityProofsTable participants={allParticipants} activity={activity} />
		</div>
	);
}
