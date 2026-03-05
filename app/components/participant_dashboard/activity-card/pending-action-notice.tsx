import { ClockIcon } from "lucide-react";

import { EnrolledConfig } from "@/app/components/participant_dashboard/activity-card/types";
import { formatDate } from "@/app/lib/formatters";

type PendingActionNoticeProps = {
	enrolledConfig: EnrolledConfig;
};

export default function PendingActionNotice({
	enrolledConfig,
}: PendingActionNoticeProps) {
	return (
		<div className="border-2 border-dashed border-amber-500 bg-amber-50 p-3 space-y-1">
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs font-bold uppercase tracking-wide text-amber-600">
					{enrolledConfig.pendingLabel}
				</p>
				{enrolledConfig.ctaType === "upload" && enrolledConfig.deadlineDate && (
					<div className="inline-flex items-center gap-1 text-amber-600 shrink-0">
						<ClockIcon className="w-3.5 h-3.5" />
						<span className="text-xs font-semibold">
							{formatDate(enrolledConfig.deadlineDate).toLocaleString({
								month: "short",
								day: "numeric",
							})}
						</span>
					</div>
				)}
			</div>
			<p className="text-xs text-primary leading-relaxed">
				{enrolledConfig.pendingDescription}
			</p>
		</div>
	);
}
