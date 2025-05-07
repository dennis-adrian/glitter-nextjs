import { BuildingIcon, CalendarDaysIcon, MapPinIcon } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import FestivalSwitches from "./festival-switches";
import { RedirectButton } from "@/app/components/redirect-button";
import { formatDate } from "@/app/lib/formatters";
import FestivalCardDropdown from "./festival-card-dropdown";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";

export default function FestivalCard({
	festival,
}: {
	festival: FestivalWithDates;
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex justify-between items-start">
					<div className="flex gap-2 items-start">
						<CardTitle>{festival.name}</CardTitle>
						<FestivalStatusBadge status={festival.status} />
					</div>
					<FestivalCardDropdown festivalId={festival.id} />
				</div>
				<CardDescription>
					{festival.description || "No definido"}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex justify-end gap-1">
					<RedirectButton
						variant="outline"
						size="sm"
						href={`/dashboard/festivals/${festival.id}/tickets`}
					>
						Ver visitantes
					</RedirectButton>
					<RedirectButton
						variant="outline"
						size="sm"
						href={`/dashboard/festivals/${festival.id}/participants`}
					>
						Ver participantes
					</RedirectButton>
					<RedirectButton
						variant="outline"
						size="sm"
						href={`/dashboard/festivals/${festival.id}/festival_activities`}
					>
						Ver actividades
					</RedirectButton>
				</div>
				<FestivalSwitches festival={festival} />
				<div className="p-4 border rounded-lg space-y-3">
					<h3 className="font-semibold text-xl">Detalles</h3>
					<div>
						{festival.festivalDates.map((date) => (
							<span className="flex gap-2 items-center" key={date.id}>
								<CalendarDaysIcon className="w-5 h-5" />{" "}
								{formatDate(date.startDate).toLocaleString({
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</span>
						))}
						<span className="flex gap-2 items-center">
							<BuildingIcon className="w-5 h-5" />{" "}
							{festival.locationLabel || "No definido"}
						</span>
						<span className="flex gap-2 items-center">
							<MapPinIcon className="w-5 h-5" />{" "}
							{festival.address || "No definido"}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
