import { BaseProfile } from "@/app/api/users/definitions";
import DateSpan from "@/app/components/atoms/date-span";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import { RedirectButton } from "@/app/components/redirect-button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
	FestivalActivity,
	FestivalActivityParticipant,
} from "@/app/lib/festivals/definitions";
import { CheckCircleIcon } from "lucide-react";

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
		<Card className="mt-3">
			<CardContent className="p-4">
				<div className="flex justify-between items-start">
					<div>
						<h4 className="font-medium leading-tight">{activity.name}</h4>
						<p className="text-sm mt-2 leading-tight">{activity.description}</p>
					</div>
					<RedirectButton
						href={`/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity/${activity.id}`}
						size="sm"
						variant="outline"
						className="border-emerald-500 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-500 focus:text-emerald-500"
						loadingText=""
					>
						Ver más
					</RedirectButton>
				</div>
				{isUserInActivity &&
					activity.requiresProof &&
					(!hasUploadedProof ? (
						<div className="flex gap-2 mt-3 flex-col items-center text-sm border border-amber-200 text-amber-800 bg-amber-50 rounded-md p-3">
							<p>
								No te olvides subir tu diseño.{" "}
								{activity.proofUploadLimitDate && (
									<span>
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
									</span>
								)}
							</p>
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
								Subiste el diseño de tu sello.
							</p>
						</div>
					))}
			</CardContent>
		</Card>
	);
}
