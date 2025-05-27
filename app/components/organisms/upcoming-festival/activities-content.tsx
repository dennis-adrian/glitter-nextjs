import { Card, CardContent } from "@/app/components/ui/card";

import { ScrollArea } from "@/app/components/ui/scroll-area";
import {
	FestivalActivity,
	FullFestival,
} from "@/app/lib/festivals/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { BaseProfile } from "@/app/api/users/definitions";
import { CheckCircleIcon, TriangleAlertIcon } from "lucide-react";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";

type ActivitiesContentProps = {
	forProfile: BaseProfile;
	festival: FullFestival;
};

export default function ActivitiesContent({
	forProfile,
	festival,
}: ActivitiesContentProps) {
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
			{userActivities.length > 0 && (
				<div>
					<h3 className="font-semibold">Tus inscripciones</h3>
					<p className="text-sm text-gray-500">
						Aquí puedes ver las actividades en las que te has inscrito.
					</p>
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
							<div key={activity.id}>
								{!hasUploadedProof && (
									<div className="flex gap-1 mt-2 flex-col items-center text-sm border border-amber-200 text-amber-800 bg-amber-50 rounded-md p-2">
										<p>No te olvides de subir el diseño de tu sello.</p>
										{userParticipation && (
											<UploadStickerDesignModal
												maxFiles={1}
												participationId={userParticipation.id}
											/>
										)}
									</div>
								)}
								<ActivityCard
									activity={activity}
									forProfile={forProfile}
									hasUploadedProof={!!hasUploadedProof}
									isUserInActivity
								/>
							</div>
						);
					})}
				</div>
			)}
			{availableActivities.length > 0 && (
				<ScrollArea className="h-[300px] pr-4">
					<div>
						<h3 className="font-semibold">Actividades Exclusivas</h3>
						<p className="text-sm text-gray-500">
							Inscríbete en actividades especiales para expositores.
						</p>

						<div className="flex flex-col gap-2 md:gap-4 mt-3">
							{availableActivities.map((activity) => (
								<ActivityCard
									key={activity.id}
									activity={activity}
									forProfile={forProfile}
								/>
							))}
						</div>
					</div>
				</ScrollArea>
			)}
		</div>
	);
}

export function ActivityCard({
	activity,
	forProfile,
	hasUploadedProof,
	isUserInActivity,
}: {
	activity: FestivalActivity;
	forProfile: BaseProfile;
	hasUploadedProof?: boolean;
	isUserInActivity?: boolean;
}) {
	return (
		<Card className="mt-3">
			<CardContent className="p-4">
				<div className="flex justify-between items-start">
					<div>
						<h4 className="font-medium leading-tight">{activity.name}</h4>
						<p className="text-sm mt-2 leading-tight">{activity.description}</p>
					</div>
					<RedirectButton
						href={`/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity`}
						size="sm"
						variant="outline"
						className="border-purple-500 text-purple-500 hover:bg-purple-50 hover:text-purple-500 focus:text-purple-500"
						loadingText=""
					>
						Ver más
					</RedirectButton>
				</div>
				{isUserInActivity &&
					(!hasUploadedProof ? (
						<div className="flex items-center gap-2 mt-2">
							<TriangleAlertIcon className="w-4 h-4 text-amber-700" />
							<p className="text-sm text-amber-700">
								Aún no subiste el diseño de tu sello.
							</p>
						</div>
					) : (
						<div className="flex items-center gap-2 mt-2">
							<CheckCircleIcon className="w-4 h-4 text-green-600" />
							<p className="text-sm text-green-600">
								Subiste el diseño de tu sello.
							</p>
						</div>
					))}
			</CardContent>
		</Card>
	);
}
