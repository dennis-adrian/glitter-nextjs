import Link from "next/link";
import { PencilIcon, ClipboardListIcon } from "lucide-react";

import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { getMaterialConfig } from "@/app/lib/festival_activites/helpers";
import ActivityParticipantsTable from "./activity-participants-table";
import ActivityWaitlistTable from "./activity-waitlist-table";

type ActivityDetailsProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
};

export default function ActivityDetails({ activity }: ActivityDetailsProps) {
	const totalParticipants = activity.details.reduce(
		(sum, d) => sum + d.participants.length,
		0,
	);
	const showVariantHeaders = activity.details.length > 1;
	const { label: materialLabel } = getMaterialConfig(activity.type);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-base font-semibold text-muted-foreground">
					{totalParticipants} participante
					{totalParticipants !== 1 ? "s" : ""}
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

			<div className="flex flex-col gap-4">
				{activity.details.map((detail, index) => {
					const participants = detail.participants.map((p) => ({
						...p,
						detail,
					}));
					const limitLabel = detail.participationLimit
						? `${participants.length}/${detail.participationLimit}`
						: `${participants.length}`;

					return (
						<div key={detail.id} className="flex flex-col gap-2">
							{showVariantHeaders && (
								<h3 className="text-sm font-medium text-muted-foreground">
									Variante {index + 1}
									{detail.description ? ` — ${detail.description}` : ""} ·{" "}
									{limitLabel} participante
									{participants.length !== 1 ? "s" : ""}
								</h3>
							)}
							<ActivityParticipantsTable
								participants={participants}
								materialLabel={materialLabel}
							/>
						</div>
					);
				})}
			</div>

			{activity.waitlistWindowMinutes !== null &&
				activity.waitlistEntries.length > 0 && (
					<div className="flex flex-col gap-2">
						<h2 className="text-base font-semibold text-muted-foreground">
							Lista de espera ({activity.waitlistEntries.length})
						</h2>
						<ActivityWaitlistTable
							entries={activity.waitlistEntries}
							festivalId={activity.festivalId}
						/>
					</div>
				)}
		</div>
	);
}
