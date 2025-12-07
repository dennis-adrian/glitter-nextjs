import { ReservationBase } from "@/app/api/reservations/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import Title from "@/app/components/atoms/title";
import FestivalActivityCard from "@/app/components/molecules/festival-activity-card";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { FullFestival } from "@/app/lib/festivals/definitions";

type ActivitiesContentProps = {
	forProfile: BaseProfile;
	festival: FullFestival;
	reservationStatus: ReservationBase["status"];
};

export default function ActivitiesContent({
	forProfile,
	festival,
	reservationStatus,
}: ActivitiesContentProps) {
	if (reservationStatus !== "accepted") {
		return (
			<div className="border border-gray-200 bg-gray-50 p-4 rounded-md text-sm text-muted-foreground">
				<p>
					No puedes inscribirte en actividades hasta que tu reserva sea
					confirmada.
				</p>
			</div>
		);
	}

	const activities = festival.festivalActivities;

	if (activities.length === 0) {
		return (
			<div className="border border-gray-200 bg-gray-50 p-4 rounded-md text-sm text-muted-foreground">
				No se encontraron actividades para este festival
			</div>
		);
	}

	const userActivities = activities.filter((activity) => {
		const { details } = activity;

		return details.some((detail) =>
			detail.participants.some(
				(participant) => participant.user.id === forProfile.id,
			),
		);
	});

	const availableActivities = activities.filter(
		(activity) =>
			!userActivities.some((userActivity) => userActivity.id === activity.id),
	);

	return (
		<div className="flex flex-col gap-5">
			<ScrollArea className="h-[calc(100vh-340px)] md:h-[calc(100vh-400px)] pr-4">
				{userActivities.length > 0 && (
					<div>
						<Title level="h3">Tus inscripciones</Title>
						<p className="text-sm text-gray-500">
							Aquí puedes ver las actividades en las que te has inscrito.
						</p>
						<div className="flex flex-col gap-3 md:gap-4 mt-3">
							{userActivities.map((activity) => {
								const participants = activity.details.flatMap(
									(detail) => detail.participants,
								);

								const userParticipation = participants.find(
									(participant) => participant.user.id === forProfile.id,
								);

								const hasUploadedProof =
									(userParticipation?.proofs?.length ?? 0) > 0;

								return (
									<FestivalActivityCard
										key={activity.id}
										activity={activity}
										forProfile={forProfile}
										hasUploadedProof={!!hasUploadedProof}
										isUserInActivity
										userParticipation={userParticipation}
									/>
								);
							})}
						</div>
					</div>
				)}
				{availableActivities.length > 0 && (
					<div className="mt-3">
						<Title level="h3">Actividades Exclusivas</Title>
						<p className="text-sm text-gray-500">
							Inscríbete en actividades especiales para expositores.
						</p>

						<div className="flex flex-col gap-3 md:gap-4 mt-3">
							{availableActivities.map((activity) => (
								<FestivalActivityCard
									key={activity.id}
									activity={activity}
									forProfile={forProfile}
								/>
							))}
						</div>
					</div>
				)}
			</ScrollArea>
		</div>
	);
}
