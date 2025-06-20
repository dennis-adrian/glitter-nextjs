import { RedirectButton } from "@/app/components/redirect-button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { PencilIcon } from "lucide-react";
import Image from "next/image";

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
						<div
							key={participant.id}
							className="border border-border rounded-md p-2 xs:p-3 w-28 xs:w-36 flex flex-col items-center gap-1"
						>
							{participant.proofs.length > 0 ? (
								<div className="relative w-20 h-20 xs:w-28 xs:h-28 overflow-hidden rounded-md">
									<Image
										src={participant.proofs[0].imageUrl}
										alt={participant.user.displayName!}
										placeholder="blur"
										blurDataURL="/img/placeholders/placeholder-300x300.png"
										loading="lazy"
										fill
										className="object-cover"
									/>
								</div>
							) : (
								<div className="relative w-20 h-20 xs:w-28 xs:h-28 overflow-hidden rounded-md">
									<Image
										src="/img/placeholders/placeholder-300x300.png"
										alt="No proof"
										loading="lazy"
										fill
										className="object-cover"
									/>
								</div>
							)}
							<p className="text-sm max-w-20 xs:max-w-28 text-ellipsis overflow-hidden">
								#{index + 1} {participant.user.displayName}
							</p>
						</div>
					)),
				)}
			</div>
		</div>
	);
}
