import { CheckIcon } from "lucide-react";

import { ActivityTheme } from "@/app/components/participant_dashboard/activity-card/types";

type EnrolledBadgeProps = {
	theme: ActivityTheme;
};

export default function EnrolledBadge({ theme }: EnrolledBadgeProps) {
	return (
		<div
			className="inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1"
			style={{ borderColor: theme.border }}
		>
			<CheckIcon
				className="w-3.5 h-3.5"
				strokeWidth={3}
				style={{ color: theme.border }}
			/>
			<span
				className="text-xs font-bold uppercase tracking-wide"
				style={{ color: theme.border }}
			>
				Inscrito
			</span>
		</div>
	);
}
