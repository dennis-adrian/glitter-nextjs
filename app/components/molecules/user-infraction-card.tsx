import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
import { formatDate } from "@/app/lib/formatters";
import {
	getInfractionStatusLabel,
	infractionSeverityLabel,
} from "@/app/lib/infractions/mappers";
import { UserInfraction } from "@/app/lib/users/definitions";
import { cn } from "@/app/lib/utils";
import { AlertCircleIcon, CheckCircleIcon, ClockIcon } from "lucide-react";
import { DateTime } from "luxon";

export default function UserInfractionCard({
	infraction,
}: {
	infraction: UserInfraction;
}) {
	let iconColor = "";
	switch (infraction.type.severity) {
		case "low":
			iconColor = "text-blue-700";
			break;
		case "medium":
			iconColor = "text-yellow-700";
			break;
		case "high":
			iconColor = "text-orange-700";
			break;
		case "critical":
			iconColor = "text-red-700";
			break;
	}

	let iconBgColor = "";
	switch (infraction.type.severity) {
		case "low":
			iconBgColor = "bg-blue-500/10";
			break;
		case "medium":
			iconBgColor = "bg-yellow-500/10";
			break;
		case "high":
			iconBgColor = "bg-orange-500/10";
			break;
		case "critical":
			iconBgColor = "bg-red-500/10";
			break;
	}

	return (
		<div className="bg-card p-4 rounded-md shadow-md border flex items-start gap-2">
			<div className={cn("p-2 rounded-lg", iconBgColor)}>
				<AlertCircleIcon className={cn("w-5 h-5", iconColor)} />
			</div>
			<div className="flex flex-col gap-1">
				<span className="font-medium text-sm">{infraction.type.label}</span>
				<Badge
					className={cn("text-xs font-normal min-w-fit mb-1", {})}
					variant={infraction.handled ? "dark" : "outline"}
				>
					{infraction.handled ? (
						<CheckCircleIcon className="w-4 h-4 mr-1" />
					) : (
						<ClockIcon className="w-4 h-4 mr-1" />
					)}
					{getInfractionStatusLabel(infraction.handled)}
				</Badge>
				<span className="text-sm text-muted-foreground">
					{infraction.type.description}
				</span>
				<Separator className="my-1" />
				<span className="text-xs text-muted-foreground">
					Registrado el{" "}
					{formatDate(infraction.createdAt).toLocaleString(DateTime.DATE_MED)}
				</span>
				{infraction.festival && (
					<span className="text-xs text-muted-foreground">
						{infraction.festival.name}
					</span>
				)}
			</div>
		</div>
	);
}
