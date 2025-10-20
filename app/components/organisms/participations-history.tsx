"use client";

import { ProfileType } from "@/app/api/users/definitions";
import ReservationStatusBadge from "@/app/components/atoms/reservation-status-badge";
import Title from "@/app/components/atoms/title";
import { Card, CardContent } from "@/app/components/ui/card";
import { FestivalBase, FullFestival } from "@/app/lib/festivals/definitions";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { formatDate } from "@/app/lib/formatters";
import {
	ArrowRightIcon,
	CalendarIcon,
	LogsIcon,
	PackageOpenIcon,
	PartyPopperIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ParticipationsHistory({
	forProfile,
	activeFestival,
}: {
	forProfile: ProfileType;
	activeFestival: FullFestival;
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

	const currentParticipation = participations.find(
		(participation) =>
			participation.reservation.festival.id === activeFestival.id,
	);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{!!currentParticipation && (
				<Card
					className="shadow-md hover:shadow-lg transition-shadow duration-300"
					onClick={() => router.push(`/my_participations`)}
				>
					<CardContent className="flex p-4 gap-2 w-full">
						<Image
							src={
								activeFestival.festivalBannerUrl ||
								"/img/placeholders/placeholder-300x300.png"
							}
							alt={activeFestival.name}
							width={80}
							height={80}
							className="rounded-md"
							blurDataURL="/img/placeholders/placeholder-300x300.png"
							placeholder="blur"
						/>
						<div className="flex flex-col gap-2 grow-1">
							<Title level="h4">{activeFestival.name}</Title>
							<ReservationStatusBadge
								status={currentParticipation.reservation.status}
							/>
							<p className="text-muted-foreground leading-tight text-sm md:text-base flex items-center gap-1">
								<CalendarIcon className="w-4 h-4" />
								{formatDate(
									activeFestival.festivalDates[0].startDate,
								).toLocaleString({
									day: "numeric",
									month: "short",
									year: "2-digit",
								})}{" "}
								-{" "}
								{formatDate(
									activeFestival.festivalDates[1].endDate,
								).toLocaleString({
									day: "numeric",
									month: "short",
									year: "2-digit",
								})}
							</p>
							<Link
								href={`/my_participations`}
								className="text-sm text-primary-500 underline flex items-center gap-1 self-end"
							>
								Ver detalles
								<ArrowRightIcon className="w-4 h-4" />
							</Link>
						</div>
					</CardContent>
				</Card>
			)}
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
				<div className="flex flex-col border rounded-md p-4 items-center justify-center gap-2 bg-card shadow-md hover:shadow-lg transition-shadow duration-300">
					<PartyPopperIcon className="w-8 h-8" />
					<span className="text-xs md:text-sm leading-tight text-center">
						Participaciones pasadas
					</span>
				</div>
				<div className="flex flex-col border rounded-md p-4 items-center justify-center gap-2 bg-card shadow-md hover:shadow-lg transition-shadow duration-300">
					<LogsIcon className="w-8 h-8" />
					<span className="text-xs md:text-sm leading-tight text-center">
						Historial de infracciones
					</span>
				</div>
			</div>
		</div>
	);
}
