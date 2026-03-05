import { Clock } from "lucide-react";

import { FestivalActivity } from "@/app/lib/festivals/definitions";
import { ActivityTheme } from "@/app/components/participant_dashboard/activity-card/types";

type RegistrationDeadlineStampProps = {
	theme: ActivityTheme;
	activity: FestivalActivity;
};

export default function RegistrationDeadlineStamp({
	theme,
	activity,
}: RegistrationDeadlineStampProps) {
	return (
		<div className="pt-2">
			<div
				className="inline-flex items-center gap-2 px-4 py-2 border-2"
				style={{
					borderColor: theme.textSecondary,
					transform: "rotate(-2deg)",
					borderStyle: "dashed",
				}}
			>
				<Clock className="w-3.5 h-3.5" style={{ color: theme.textSecondary }} />
				<p
					className="text-xs font-bold uppercase tracking-wide"
					style={{ color: theme.textSecondary }}
				>
					Hasta:{" "}
					{new Date(activity.registrationEndDate).toLocaleDateString("es-ES", {
						day: "numeric",
						month: "short",
						year: "numeric",
					})}
				</p>
			</div>
		</div>
	);
}
