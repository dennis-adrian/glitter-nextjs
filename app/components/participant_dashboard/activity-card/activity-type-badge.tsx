import { ActivityTheme } from "@/app/components/participant_dashboard/activity-card/types";
import { FestivalActivity } from "@/app/lib/festivals/definitions";
import { ACTIVITY_ICONS, ACTIVITY_LABELS } from "./constants";

type ActivityTypeBadgeProps = {
	theme: ActivityTheme;
	activityType: FestivalActivity["type"];
};

export default function ActivityTypeBadge({
	theme,
	activityType,
}: ActivityTypeBadgeProps) {
	const Icon = ACTIVITY_ICONS[activityType];

	return (
		<div
			className="inline-flex items-center gap-2 px-3 py-1.5"
			style={{
				backgroundColor: theme.accent,
				clipPath:
					"polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
			}}
		>
			<Icon
				className="w-4 h-4"
				style={{
					color: theme.accentText,
					strokeWidth: 2.5,
				}}
			/>
			<span
				className="text-xs font-bold uppercase tracking-widest"
				style={{ color: theme.accentText }}
			>
				{ACTIVITY_LABELS[activityType]}
			</span>
		</div>
	);
}
