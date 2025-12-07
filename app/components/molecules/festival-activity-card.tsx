import { BaseProfile } from "@/app/api/users/definitions";
import DateSpan from "@/app/components/atoms/date-span";
import Title from "@/app/components/atoms/title";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import { RedirectButton } from "@/app/components/redirect-button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
	FestivalActivity,
	FestivalActivityParticipant,
} from "@/app/lib/festivals/definitions";
import { CheckCircleIcon, CircleAlertIcon, ThumbsUpIcon } from "lucide-react";
import Image from "next/image";

type FestivalActivityCardProps = {
	activity: FestivalActivity;
	forProfile: BaseProfile;
	hasUploadedProof?: boolean;
	isUserInActivity?: boolean;
	userParticipation?: FestivalActivityParticipant;
};

export default function FestivalActivityCard({
	activity,
	forProfile,
	hasUploadedProof,
	isUserInActivity,
	userParticipation,
}: FestivalActivityCardProps) {
	return (
		<Card>
			<CardContent className="p-4 flex items-start gap-2 md:gap-3">
				{activity.promotionalArtUrl && (
					<Image
						className="rounded-md aspect-square hidden md:block"
						src={activity.promotionalArtUrl}
						alt="arte promocional de la actividad"
						width={160}
						height={160}
					/>
				)}
				<div className="flex flex-col gap-3 md:gap-4 w-full">
					<div>
						<Title level="h4">{activity.name}</Title>
						<p className="text-sm mt-2 leading-tight">{activity.description}</p>
					</div>
					{isUserInActivity &&
						activity.requiresProof &&
						(!hasUploadedProof ? (
							<div className="flex flex-col gap-2 md:gap-3 text-sm border border-amber-200 text-amber-900 bg-amber-50 rounded-md p-3">
								<div className="flex gap-2 md:gap-3">
									<CircleAlertIcon className="w-5 h-5 text-amber-900" />
									<div className="flex flex-col gap-1 md:gap-2">
										<p>No te olvides subir tu diseño</p>
										{activity.proofUploadLimitDate && (
											<p className="text-yellow-700">
												Tienes hasta el{" "}
												<DateSpan
													date={activity.proofUploadLimitDate}
													format={{ month: "long", day: "numeric" }}
												/>{" "}
												a las{" "}
												<DateSpan
													date={activity.proofUploadLimitDate}
													format={{ hour: "numeric", minute: "numeric" }}
												/>
												.
											</p>
										)}
									</div>
								</div>
								{userParticipation && (
									<UploadStickerDesignModal
										maxFiles={1}
										participationId={userParticipation.id}
									/>
								)}
							</div>
						) : (
							<div className="flex items-center gap-2 mt-2">
								<CheckCircleIcon className="w-4 h-4 text-green-600" />
								<p className="text-sm text-green-600">
									{activity.type === "best_stand"
										? "Subiste la imagen de tu stand"
										: "Subiste el diseño de tu sello."}
								</p>
							</div>
						))}
					<div className="flex flex-row w-full md:w-fit gap-1 md:gap-2">
						<RedirectButton
							href={`/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity/${activity.id}`}
							size="sm"
							variant="outline"
							className="w-full md:w-28 border-emerald-500 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-500 focus:text-emerald-500"
							loadingText=""
						>
							Ver más
						</RedirectButton>
						{activity.allowsVoting && (
							<RedirectButton
								href={`/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity/${activity.id}/voting`}
								size="sm"
								className="w-full md:w-28 bg-emerald-500 hover:bg-emerald-500/60 text-white rounded-md"
								loadingText=""
							>
								<ThumbsUpIcon className="w-4 h-4 mr-1" />
								Votación
							</RedirectButton>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
