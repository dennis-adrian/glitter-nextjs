import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import { notFound } from "next/navigation";
import { z } from "zod";
import ParticipantSelection from "./participant-selection";

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

	const allParticipants = activity.details.flatMap(
		(detail) => detail.participants,
	);

	return (
		<div className="container p-3 md:p-6">
			<h1 className="text-lg md:text-xl font-bold">
				Revision de Actividad Completa
			</h1>
			<ParticipantSelection participants={allParticipants} />
		</div>
	);
}
