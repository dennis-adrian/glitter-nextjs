import Title from "@/app/components/atoms/heading";
import BestStandActivityVoting from "@/app/components/organisms/festival_activity_voting/best-stand-activity-voting";
import FestivalStickerVoting from "@/app/components/organisms/festival_activity_voting/festival-sticker-voting";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import { fetchPublicReservationsByFestivalId } from "@/app/lib/reservations/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type VotingPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function VotingPage({ params }: VotingPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const { id: festivalId, activityId } = validatedParams.data;

	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile) {
		redirect(
			`/sign_in?returnUrl=/festivals/${festivalId}/activity/${activityId}/voting`,
		);
	}

	const [activity, festivalReservations] = await Promise.all([
		fetchFestivalActivity(activityId),
		fetchPublicReservationsByFestivalId(festivalId),
	]);

	if (!activity || !activity.allowsVoting) return notFound();

	return (
		<div className="container p-3 md:p-6">
			<Title>Votación para {activity.name}</Title>
			{activity.type === "best_stand" && (
				<BestStandActivityVoting
					activity={activity}
					currentProfile={currentProfile}
					reservations={festivalReservations}
				/>
			)}
			{activity.type === "festival_sticker" && (
				<FestivalStickerVoting
					activity={activity}
					currentProfile={currentProfile}
				/>
			)}
		</div>
	);
}
