import { ProfileType } from "@/app/api/users/definitions";
import ReservationStatusBadge from "@/app/components/atoms/reservation-status-badge";
import { RedirectButton } from "@/app/components/redirect-button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { FullFestival } from "@/app/lib/festivals/definitions";
import { formatDate, getFestivalDateString } from "@/app/lib/formatters";
import {
	ArrowRightIcon,
	CalendarIcon,
	HistoryIcon,
	LandPlotIcon,
	PackageOpenIcon,
} from "lucide-react";
import Image from "next/image";

type HistorySectionProps = {
	profile: ProfileType;
	activeFestival: FullFestival | null | undefined;
};

export default function HistorySection({
	profile,
	activeFestival,
}: HistorySectionProps) {
	const pastParticipations = profile.participations.filter(
		(p) => !activeFestival || p.reservation.festivalId !== activeFestival.id,
	);

	// Show at most 3 past participations
	const recentParticipations = pastParticipations.slice(0, 3);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle className="text-lg flex items-center gap-2">
						<HistoryIcon className="w-5 h-5" />
						Historial de participaciones
					</CardTitle>
					{pastParticipations.length > 0 && (
						<RedirectButton
							href="/my_history"
							variant="link"
							size="sm"
							className="p-0 h-auto text-xs"
						>
							Ver todo
							<ArrowRightIcon className="ml-1 w-3 h-3" />
						</RedirectButton>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{recentParticipations.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-4 text-muted-foreground">
						<PackageOpenIcon className="w-12 h-12" />
						<span className="text-sm">
							Aún no tenés participaciones anteriores
						</span>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{recentParticipations.map((participation) => {
							const festival = participation.reservation.festival;
							const stand = participation.reservation.stand;
							const festivalDates = festival.festivalDates;

							const startDate = festivalDates?.[0]?.startDate
								? formatDate(festivalDates[0].startDate).toLocaleString({
										day: "numeric",
										month: "short",
										year: "2-digit",
									})
								: null;

							const endDate =
								festivalDates &&
								festivalDates.length > 1 &&
								festivalDates[festivalDates.length - 1]?.endDate
									? formatDate(
											festivalDates[festivalDates.length - 1].endDate,
										).toLocaleString({
											day: "numeric",
											month: "short",
											year: "2-digit",
										})
									: null;

							return (
								<div
									key={participation.id}
									className="flex gap-3 p-3 border rounded-md"
								>
									<div className="relative w-16 h-20 rounded-md overflow-hidden shrink-0 bg-muted">
										{festival.festivalBannerUrl ? (
											<Image
												src={festival.festivalBannerUrl}
												alt={festival.name}
												fill
												className="object-cover"
											/>
										) : (
											<div className="w-full h-full bg-primary/10" />
										)}
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<p className="text-sm font-medium truncate">
											{festival.name}
										</p>
										<ReservationStatusBadge
											status={participation.reservation.status}
											className="w-fit"
										/>
										<p className="text-xs text-muted-foreground flex items-center gap-1">
											<LandPlotIcon className="w-3 h-3" />
											{stand.label}
											{stand.standNumber}
										</p>
										{getFestivalDateString(startDate, endDate) && (
											<p className="text-xs text-muted-foreground flex items-center gap-1">
												<CalendarIcon className="w-3 h-3" />
												{getFestivalDateString(startDate, endDate)}
											</p>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
