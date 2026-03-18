import Image from "next/image";

import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import {
	FestivalActivityWithDetailsAndParticipants,
	FestivalBase,
} from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";

type CouponBookActivityPageProps = {
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalId: FestivalBase["id"];
};

export default function CouponBookActivityPage({
	activity,
	currentProfile,
	forProfile,
	festivalId,
}: CouponBookActivityPageProps) {
	const proofUploadLimitDate = activity.proofUploadLimitDate
		? formatDate(activity.proofUploadLimitDate)
		: null;

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
				</div>
			)}

			{proofUploadLimitDate && (
				<div className="flex flex-col gap-3">
					<Heading level={2}>
						Condiciones para participar de la actividad
					</Heading>
					<ol className="ml-2 list-decimal list-inside space-y-2 text-sm md:text-base">
						<li>
							Cargar la promoción al sitio web hasta el{" "}
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
					</ol>
				</div>
			)}

			<EnrollRedirectButton
				currentProfile={currentProfile}
				forProfile={forProfile}
				festivalId={festivalId}
				activity={activity}
			/>
		</div>
	);
}
