import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import FestivalActivityForm from "@/app/components/festivals/festival_activities/forms/festival-activity-form";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type EditFestivalActivityPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: EditFestivalActivityPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const { id: festivalId, activityId } = validatedParams.data;

	const activity = await fetchFestivalActivity(activityId);
	if (!activity || activity.festivalId !== festivalId) return notFound();

	return (
		<div className="container p-4 md:p-6 space-y-4">
			<div className="flex items-center gap-2">
				<Link
					href={`/dashboard/festivals/${festivalId}/festival_activities`}
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeftIcon className="w-4 h-4" />
				</Link>
				<h1 className="text-2xl font-bold">Editar actividad</h1>
			</div>
			<FestivalActivityForm festivalId={festivalId} activity={activity} />
		</div>
	);
}
