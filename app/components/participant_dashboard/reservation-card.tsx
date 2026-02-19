import { CalendarDaysIcon, ClockIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Participation, ProfileType } from "@/app/api/users/definitions";
import { FestivalDate, FestivalWithDates } from "@/app/lib/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";

type Props = {
	profile: ProfileType;
	activeFestival: FestivalWithDates | null;
	activeParticipation: Participation | null | undefined;
};

const STATUS_CONFIG: Record<
	string,
	{ label: string; badge: string; headerGradient: string }
> = {
	pending: {
		label: "Pendiente",
		badge: "bg-amber-100 text-amber-700 border-amber-300",
		headerGradient: "bg-gradient-to-r from-amber-600 to-amber-400",
	},
	verification_payment: {
		label: "Verificando pago",
		badge: "bg-blue-100 text-blue-700 border-blue-300",
		headerGradient: "bg-gradient-to-r from-blue-700 to-blue-500",
	},
	accepted: {
		label: "Confirmado",
		badge: "bg-green-100 text-green-700 border-green-300",
		headerGradient: "bg-gradient-to-r from-green-700 to-green-500",
	},
	rejected: {
		label: "Rechazada",
		badge: "bg-red-100 text-red-700 border-red-300",
		headerGradient: "bg-gradient-to-r from-red-700 to-red-500",
	},
};

function getDaysUntilEvent(festivalDates: FestivalDate[]): number | null {
	if (!festivalDates.length) return null;
	const earliest = festivalDates
		.map((d) => new Date(d.startDate))
		.sort((a, b) => a.getTime() - b.getTime())[0];
	const diff = Math.ceil((earliest.getTime() - Date.now()) / 86400000);
	return diff >= 0 ? diff : null;
}

export default function ReservationCard({
	profile,
	activeFestival,
	activeParticipation,
}: Props) {
	// State A: user has a reservation in the active festival
	if (activeParticipation) {
		const { reservation } = activeParticipation;
		const { stand, festival } = reservation;
		const statusConfig =
			STATUS_CONFIG[reservation.status] ?? STATUS_CONFIG.pending;
		const daysUntil = getDaysUntilEvent(festival.festivalDates ?? []);
		const locationText = festival.locationLabel ?? festival.address;
		const mapUrl = festival.locationUrl ?? festival.generalMapUrl;

		return (
			<Card className="overflow-hidden">
				<div className="h-32 relative overflow-hidden bg-muted">
					{festival.festivalBannerUrl ? (
						<img
							src={festival.festivalBannerUrl}
							alt=""
							className="w-full h-full object-cover"
						/>
					) : (
						<div className={`w-full h-full ${statusConfig.headerGradient}`} />
					)}
				</div>
				<CardContent className="p-4 md:p-5 flex flex-col gap-3">
					{locationText && (
						<p className="text-xs text-muted-foreground uppercase tracking-wide">
							{locationText}
						</p>
					)}
					<div className="flex items-start justify-between gap-2">
						<h3 className="font-space-grotesk font-bold tracking-wide text-base leading-snug">
							{festival.name}
						</h3>
						<Badge className={statusConfig.badge} size="sm">
							{statusConfig.label}
						</Badge>
					</div>

					{daysUntil !== null && (
						<p className="text-sm text-muted-foreground flex items-center gap-1.5">
							<ClockIcon className="w-3.5 h-3.5 shrink-0" />
							{daysUntil === 0
								? "¡Hoy es el evento!"
								: `${daysUntil} días para el evento`}
						</p>
					)}

					<div className="flex items-center justify-between gap-2">
						<p className="text-sm flex items-center gap-1.5">
							<MapPinIcon className="w-3.5 h-3.5 shrink-0 text-primary" />
							<span>
								Stand #{stand.standNumber}
								{stand.standCategory && (
									<span className="text-muted-foreground">
										{" "}
										· {stand.standCategory}
									</span>
								)}
							</span>
						</p>
						{mapUrl && (
							<Button asChild variant="outline" size="sm">
								<a href={mapUrl} target="_blank" rel="noopener noreferrer">
									Mapa
								</a>
							</Button>
						)}
					</div>

					<Button asChild variant="default" size="sm" className="w-full">
						<Link
							href={`/profiles/${profile.id}/festivals/${reservation.festivalId}/reservations`}
						>
							Ver reserva
						</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	// State B: no reservation but festival with open registration
	if (
		activeFestival &&
		(activeFestival.publicRegistration || activeFestival.eventDayRegistration)
	) {
		const dateLabel =
			activeFestival.festivalDates.length > 0
				? getFestivalDateLabel(activeFestival)
				: null;

		return (
			<Card className="overflow-hidden">
				<div className="h-32 relative overflow-hidden bg-muted">
					{activeFestival.festivalBannerUrl ? (
						<img
							src={activeFestival.festivalBannerUrl}
							alt=""
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="w-full h-full bg-gradient-to-r from-primary to-primary/80" />
					)}
				</div>
				<CardContent className="p-4 md:p-5 flex flex-col gap-3">
					{activeFestival.locationLabel && (
						<p className="text-xs text-muted-foreground uppercase tracking-wide">
							{activeFestival.locationLabel}
						</p>
					)}
					<div>
						<p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
							Próximo festival
						</p>
						<h3 className="font-space-grotesk font-bold tracking-wide text-base leading-snug">
							{activeFestival.name}
						</h3>
						{dateLabel && (
							<p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
								<CalendarDaysIcon className="w-3.5 h-3.5 shrink-0" />
								{dateLabel}
							</p>
						)}
					</div>
					<p className="text-sm text-muted-foreground">
						¡Todavía hay stands disponibles! Reserva el tuyo antes de que se
						agoten.
					</p>
					<Button asChild className="w-full">
						<Link href={`/festivals/${activeFestival.id}/registration`}>
							Reservar mi stand
						</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	// State C: no active festival
	return (
		<Card className="border-dashed">
			<CardContent className="p-5 md:p-6 flex flex-col items-center text-center gap-3">
				<div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
					<CalendarDaysIcon className="w-6 h-6 text-muted-foreground" />
				</div>
				<div>
					<h3 className="font-semibold text-sm">Sin festival activo</h3>
					<p className="text-xs text-muted-foreground mt-1">
						Cuando haya un nuevo festival, tu reserva aparecerá aquí.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
