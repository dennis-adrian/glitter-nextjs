import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import ActivityDetails from "@/app/dashboard/festivals/[id]/festival_activities/activity-details";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

type AdminActivityDetailProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalId: number;
};

export default function AdminActivityDetail({
	activity,
	festivalId,
}: AdminActivityDetailProps) {
	return (
		<div className="container p-4 md:p-6 space-y-4">
			<div className="flex items-center gap-2">
				<Link
					href={`/dashboard/festivals/${festivalId}/festival_activities`}
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeftIcon className="w-4 h-4" />
				</Link>
				<h1 className="text-2xl font-bold leading-tight">{activity.name}</h1>
			</div>
			<ActivityDetails activity={activity} />
		</div>
	);
}
