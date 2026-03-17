import Link from "next/link";
import { PencilIcon, ClipboardListIcon } from "lucide-react";

import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import ActivityParticipantsTable from "./activity-participants-table";

type ActivityDetailsProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
};

export default function ActivityDetails({ activity }: ActivityDetailsProps) {
	const allParticipants = activity.details.flatMap((detail) =>
		detail.participants.map((p) => ({ ...p, detail })),
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-base font-semibold text-muted-foreground">
					{allParticipants.length} participante
					{allParticipants.length !== 1 ? "s" : ""}
				</h2>
				<div className="flex gap-2">
					<Button asChild variant="outline" size="sm">
						<Link
							href={`/dashboard/festivals/${activity.festivalId}/festival_activities/${activity.id}/edit`}
						>
							<PencilIcon className="w-4 h-4 mr-1" />
							Editar
						</Link>
					</Button>
					<RedirectButton
						href={`/dashboard/festivals/${activity.festivalId}/festival_activities/${activity.id}/review`}
						size="sm"
					>
						<ClipboardListIcon className="w-4 h-4 mr-1" />
						Iniciar revisión
					</RedirectButton>
				</div>
			</div>

			<ActivityParticipantsTable participants={allParticipants} />
		</div>
	);
}
