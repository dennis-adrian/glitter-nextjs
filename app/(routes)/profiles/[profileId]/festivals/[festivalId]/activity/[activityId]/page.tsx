import FestivalStickerActivityPage from "@/app/components/pages/festival_activities/festival-sticker-activity";
import PassportActivityPage from "@/app/components/pages/festival_activities/passport-activity";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	festivalId: z.coerce.number(),
	activityId: z.coerce.number(),
});

type ParticipantsActivityPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function ParticipantsActivityPage({
	params,
}: ParticipantsActivityPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);

	if (!validatedParams.success) return notFound();

	const { profileId, festivalId, activityId } = validatedParams.data;
	const currentProfile = await getCurrentUserProfile();
	await protectRoute(currentProfile || undefined, profileId);

	const activity = await fetchFestivalActivity(activityId);

	if (!activity) return notFound();

	if (activity.type === "stamp_passport") {
		return (
			<div className="container p-3 md:p-6">
				<PassportActivityPage
					activity={activity}
					currentProfile={currentProfile!}
					forProfileId={profileId}
					festivalId={festivalId}
				/>
			</div>
		);
	}

	if (activity.type === "festival_sticker") {
		return <FestivalStickerActivityPage activity={activity} />;
	}

	return <div className="container p-3 md:p-6">Hello World</div>;
}
