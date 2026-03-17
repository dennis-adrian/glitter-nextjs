import Image from "next/image";

import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import {
	FestivalActivityWithDetailsAndParticipants,
	FestivalBase,
} from "@/app/lib/festivals/definitions";
import { resolveConditions } from "@/app/lib/festival_activites/helpers";
import { formatDate } from "@/app/lib/formatters";

type PassportActivityPageProps = {
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalId: FestivalBase["id"];
};

export default function PassportActivityPage({
	activity,
	currentProfile,
	forProfile,
	festivalId,
}: PassportActivityPageProps) {
	const proofUploadLimitDate = activity.proofUploadLimitDate
		? formatDate(activity.proofUploadLimitDate)
		: null;

	// Find the detail matching the user's category, fall back to first detail
	const matchedDetail =
		activity.details.find((d) => d.category === forProfile.category) ??
		activity.details[0];

	const resolved = matchedDetail
		? resolveConditions(matchedDetail, activity)
		: null;

	const requirements = resolved?.requirements ?? [];

	return (
		<div className="flex flex-col gap-4">
			<Heading>{activity.name}</Heading>

			{activity.description && (
				<p className="text-sm md:text-base">{activity.description}</p>
			)}

			{activity.promotionalArtUrl && (
				<div className="flex flex-col gap-2 w-full items-center">
					<div className="relative w-full aspect-3/4 max-w-[500px]">
						<Image
							className="object-cover"
							src={activity.promotionalArtUrl}
							alt="arte promocional de la actividad"
							fill
							placeholder="blur"
							blurDataURL="/img/placeholders/placeholder-300x300.png"
						/>
					</div>
				</div>
			)}

			{activity.visitorsDescription && (
				<div className="flex flex-col gap-3">
					<Heading level={2}>¿En qué consiste la actividad?</Heading>
					<p className="text-sm md:text-base">{activity.visitorsDescription}</p>
					{activity.activityPrizeUrl && (
						<div className="flex flex-col gap-2 w-full items-center my-3">
							<Heading level={3}>Pin de edición especial</Heading>
							<div className="relative w-full max-w-[240px] md:max-w-[320px] aspect-square">
								<Image
									className="object-cover"
									src={activity.activityPrizeUrl}
									alt="pin de edición especial de la actividad"
									fill
									placeholder="blur"
									blurDataURL="/img/placeholders/placeholder-300x300.png"
								/>
							</div>
						</div>
					)}
				</div>
			)}

			{(requirements.length > 0 || proofUploadLimitDate) && (
				<div className="flex flex-col gap-3">
					<Heading level={2}>
						Condiciones para participar de la actividad
					</Heading>
					<ol className="ml-2 list-decimal list-inside space-y-2 text-sm md:text-base">
						{requirements.map((condition, i) => (
							<li key={i}>{condition}</li>
						))}
						{proofUploadLimitDate && (
							<li>
								Subir el diseño del sello al sitio web hasta el{" "}
								<strong>
									{proofUploadLimitDate.toLocaleString({
										month: "long",
										day: "numeric",
									})}
								</strong>{" "}
								a las{" "}
								<strong>
									{proofUploadLimitDate.toLocaleString({
										hour: "numeric",
										minute: "numeric",
									})}
								</strong>
								.
							</li>
						)}
					</ol>
				</div>
			)}

			<div className="bg-amber-50 border border-amber-100 rounded-md p-4 mt-4 text-amber-800">
				<p className="text-sm md:text-base">
					Una vez inscrito a la actividad, el participante se compromete a
					cumplir con todas estas condiciones. En caso de incumplimiento, podría
					perder el derecho a participar en futuros eventos y/o actividades.
				</p>
			</div>

			<EnrollRedirectButton
				currentProfile={currentProfile}
				forProfile={forProfile}
				festivalId={festivalId}
				activity={activity}
			/>
		</div>
	);
}
