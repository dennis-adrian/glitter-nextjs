import { RedirectButton } from "@/app/components/redirect-button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { PencilIcon } from "lucide-react";
import ParticipantCard from "./participant-card";

type ActivityDetailsProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
};

export default function ActivityDetails({ activity }: ActivityDetailsProps) {
	return (
		<div className="flex flex-col gap-2">
			<h2 className="text-lg font-semibold">Participantes</h2>
			<div className="flex justify-end">
				<RedirectButton
					href={`/dashboard/festivals/${activity.festivalId}/festival_activities/${activity.id}/review`}
					size="sm"
				>
					Iniciar revisión
					<PencilIcon className="w-4 h-4 ml-1" />
				</RedirectButton>
			</div>
			<div className="flex flex-wrap justify-center md:justify-start gap-2 my-2">
				{activity.details.map((detail) =>
					detail.participants.map((participant, index) => (
						<ParticipantCard
							key={participant.id}
							participant={participant}
							index={index}
						/>
					)),
				)}
			</div>
		</div>
	);
}
