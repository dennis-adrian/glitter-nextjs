import Title from "@/app/components/atoms/title";
import BestStandActivityVoting from "@/app/components/organisms/festival_activity_voting/best-stand-activity-voting";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	festivalId: z.coerce.number(),
	activityId: z.coerce.number(),
});

type VotingPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function VotingPage({ params }: VotingPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const { profileId, festivalId, activityId } = validatedParams.data;

	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile) return notFound();

	await protectRoute(currentProfile || undefined, profileId);

	const activity = await fetchFestivalActivity(activityId);
	if (!activity || !activity.allowsVoting) return notFound();

	return (
		<div className="container p-3 md:p-6">
			<Title level="h1">Votación para {activity.name}</Title>
			<BestStandActivityVoting activity={activity} />
		</div>
	);
}
