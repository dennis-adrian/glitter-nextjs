import Link from "next/link";

import { ChevronRightIcon, VoteIcon } from "lucide-react";

import { BaseProfile } from "@/app/api/users/definitions";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import {
	ActivityTheme,
	EnrolledConfig,
} from "@/app/components/participant_dashboard/activity-card/types";
import { Button } from "@/app/components/ui/button";
import {
	FestivalActivityWithDetailsAndParticipants,
	FestivalBase,
} from "@/app/lib/festivals/definitions";

type EnrolledUsersCtaProps = {
	enrolledConfig: EnrolledConfig;
	participationId: number;
	festivalId: FestivalBase["id"];
	activityId: FestivalActivityWithDetailsAndParticipants["id"];
	forProfile: BaseProfile;
	theme: ActivityTheme;
};

export default function EnrolledUsersCta({
	enrolledConfig,
	participationId,
	festivalId,
	activityId,
	forProfile,
	theme,
}: EnrolledUsersCtaProps) {
	return (
		<div className="pt-2 space-y-3">
			{enrolledConfig.isPending &&
				(enrolledConfig.ctaType === "upload" ? (
					<UploadStickerDesignModal
						participationId={participationId}
						maxFiles={1}
						triggerLabel={enrolledConfig.ctaLabel}
						triggerClassName="bg-amber-500 border-0 text-white hover:bg-amber-600"
					/>
				) : (
					<Button
						className="w-full font-bold border-0 hover:opacity-90 transition-opacity bg-amber-500 hover:bg-amber-600 text-white"
						size="lg"
						asChild
					>
						<Link
							href={`/profiles/${forProfile.id}/festivals/${festivalId}/activity/${activityId}/voting`}
						>
							<VoteIcon className="w-4 h-4 mr-1" />
							{enrolledConfig.ctaLabel}
						</Link>
					</Button>
				))}
			<Link
				href={`/profiles/${forProfile.id}/festivals/${festivalId}/activity/${activityId}`}
				className="flex items-center justify-center gap-1 text-sm font-semibold transition-opacity hover:opacity-80"
				style={{ color: theme.textPrimary }}
			>
				Ver Detalles
				<ChevronRightIcon className="w-4 h-4" />
			</Link>
		</div>
	);
}
