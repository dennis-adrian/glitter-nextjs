"use client";

import { ProfileType } from "@/app/api/users/definitions";
import ReservationStatusBadge from "@/app/components/atoms/reservation-status-badge";
import Title from "@/app/components/atoms/title";
import { RedirectButton } from "@/app/components/redirect-button";
import { Card, CardContent } from "@/app/components/ui/card";
import { FullFestival } from "@/app/lib/festivals/definitions";
import { formatDate, getFestivalDateString } from "@/app/lib/formatters";
import {
	ArrowRightIcon,
	CalendarIcon,
	LandPlotIcon,
	LogsIcon,
	PackageOpenIcon,
	PartyPopperIcon,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function ParticipationsHistory({
	forProfile,
	activeFestival,
}: {
	forProfile: ProfileType;
	activeFestival?: FullFestival | null;
}) {
	const router = useRouter();
	const participations = forProfile.participations;

	if (participations.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
					<PackageOpenIcon className="w-20 h-20" />
					<span>No hay participaciones disponibles</span>
				</CardContent>
			</Card>
		);
	}

	const currentParticipation = activeFestival
		? participations.find(
				(participation) =>
					participation.reservation.festival.id === activeFestival.id,
			)
		: null;

	const festivalDates = activeFestival?.festivalDates;
	const startDate = festivalDates?.[0]?.startDate
		? formatDate(festivalDates[0].startDate).toLocaleString({
				day: "numeric",
				month: "short",
				year: "2-digit",
			})
		: null;

	const endDate =
		festivalDates?.length &&
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
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{!!currentParticipation && !!activeFestival && (
				<Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
					<CardContent className="flex p-4 gap-2 w-full">
						<div className="relative w-20 h-30 md:w-30 md:h-40 rounded-md">
							<Image
								src={
									activeFestival.festivalBannerUrl ||
									"/img/placeholders/placeholder-300x300.png"
								}
								alt={activeFestival.name}
								fill
								className="object-cover rounded-md"
								blurDataURL="/img/placeholders/placeholder-300x300.png"
								placeholder="blur"
							/>
						</div>
						<div className="flex flex-col gap-2 grow-1">
							<Title level="h4" className="my-0">
								{activeFestival.name}
							</Title>
							<ReservationStatusBadge
								status={currentParticipation.reservation.status}
							/>
							<p className="text-muted-foreground leading-tight text-sm md:text-base flex items-center gap-1">
								<LandPlotIcon className="w-4 h-4" />
								Espacio {currentParticipation.reservation.stand.label}
								{currentParticipation.reservation.stand.standNumber}
							</p>
							{getFestivalDateString(startDate, endDate) && (
								<p className="text-muted-foreground leading-tight text-sm md:text-base flex items-center gap-1">
									<CalendarIcon className="w-4 h-4" />
									{getFestivalDateString(startDate, endDate)}
								</p>
							)}
							<RedirectButton
								href={`/my_participations`}
								className="text-sm flex items-center gap-1 self-end w-fit"
								variant="link"
							>
								Ver detalles
								<ArrowRightIcon className="w-4 h-4" />
							</RedirectButton>
						</div>
					</CardContent>
				</Card>
			)}
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
				<div
					className="flex flex-col border rounded-md p-4 items-center justify-center gap-2 bg-card shadow-md hover:shadow-lg transition-shadow duration-300"
					onClick={() =>
						router.push(`/profiles/${forProfile.id}/participations`)
					}
				>
					<PartyPopperIcon className="w-8 h-8" />
					<span className="text-xs md:text-sm leading-tight text-center">
						Historial de participaciones
					</span>
				</div>
				<div
					className="flex flex-col border rounded-md p-4 items-center justify-center gap-2 bg-card shadow-md hover:shadow-lg transition-shadow duration-300"
					onClick={() => router.push(`/profiles/${forProfile.id}/infractions`)}
				>
					<LogsIcon className="w-8 h-8" />
					<span className="text-xs md:text-sm leading-tight text-center">
						Historial de infracciones
					</span>
				</div>
			</div>
		</div>
	);
}
