import { notFound } from "next/navigation";
import { z } from "zod";

import AdminActivityDetail from "@/app/components/festivals/festival_activities/admin-activity-detail";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type ActivityPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: ActivityPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) {
		return notFound();
	}

	const { id: festivalId, activityId } = validatedParams.data;

	const activity = await fetchFestivalActivity(activityId);
	if (!activity || activity.festivalId !== festivalId) {
		return notFound();
	}

	return <AdminActivityDetail activity={activity} festivalId={festivalId} />;
}
