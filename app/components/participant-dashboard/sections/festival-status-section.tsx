import { ProfileType } from "@/app/api/users/definitions";
import ReservationStatusBadge from "@/app/components/atoms/reservation-status-badge";
import { RedirectButton } from "@/app/components/redirect-button";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { profileHasReservationMade } from "@/app/helpers/next_event";
import { fetchInvoicesByReservation } from "@/app/data/invoices/actions";
import { formatFullDate } from "@/app/lib/formatters";
import { FullFestival } from "@/app/lib/festivals/definitions";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import {
	ArrowRightIcon,
	CalendarIcon,
	CircleAlertIcon,
	MapPinIcon,
	PackageOpenIcon,
	PartyPopperIcon,
	LandPlotIcon,
} from "lucide-react";
import { DateTime } from "luxon";

type FestivalStatusSectionProps = {
	profile: ProfileType;
	festival: FullFestival | null | undefined;
};

export default async function FestivalStatusSection({
	profile,
	festival,
}: FestivalStatusSectionProps) {
	if (!festival) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
					<PackageOpenIcon className="w-12 h-12" />
					<p className="text-sm text-center">
						No hay un festival activo en este momento. Mantente atento
						para el próximo evento.
					</p>
				</CardContent>
			</Card>
		);
	}

	const startDate = festival.festivalDates?.[0]?.startDate
		? formatFullDate(festival.festivalDates[0].startDate, DateTime.DATE_MED)
		: null;
	const endDate =
		festival.festivalDates?.length > 1
			? formatFullDate(
					festival.festivalDates[festival.festivalDates.length - 1]
						?.startDate,
					DateTime.DATE_MED,
				)
			: null;
	const dateLabel =
		startDate && endDate ? `${startDate} - ${endDate}` : startDate;

	const isInFestival = isProfileInFestival(festival.id, profile);
	const hasReservation = profileHasReservationMade(profile, festival.id);

	// User is NOT accepted into the festival yet
	if (!isInFestival) {
		return (
			<Card>
				<CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-lg">
					<CardTitle className="text-lg md:text-xl">
						{festival.name}
					</CardTitle>
					<div className="flex flex-col sm:flex-row gap-1 text-sm text-muted-foreground">
						{dateLabel && (
							<span className="flex items-center gap-1">
								<CalendarIcon className="w-4 h-4" />
								{dateLabel}
							</span>
						)}
						{festival.locationLabel && (
							<span className="flex items-center gap-1">
								<MapPinIcon className="w-4 h-4" />
								{festival.locationLabel}
							</span>
						)}
					</div>
				</CardHeader>
				<CardContent className="pt-4">
					<p className="text-sm text-muted-foreground mb-3">
						Se acerca un nuevo festival. Leé y aceptá los términos y
						condiciones para participar.
					</p>
					<RedirectButton
						variant="cta"
						href={`/profiles/${profile.id}/festivals/${festival.id}/terms`}
					>
						Inscribirte
						<ArrowRightIcon className="ml-2 w-4 h-4" />
					</RedirectButton>
				</CardContent>
			</Card>
		);
	}

	// User is accepted but has NOT made a reservation
	if (!hasReservation) {
		return (
			<Card>
				<CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-lg">
					<CardTitle className="text-lg md:text-xl">
						{festival.name}
					</CardTitle>
					<div className="flex flex-col sm:flex-row gap-1 text-sm text-muted-foreground">
						{dateLabel && (
							<span className="flex items-center gap-1">
								<CalendarIcon className="w-4 h-4" />
								{dateLabel}
							</span>
						)}
					</div>
				</CardHeader>
				<CardContent className="pt-4">
					<p className="text-sm text-muted-foreground mb-3">
						Ya fuiste aceptado/a para participar. No te quedés sin
						reservar tu espacio.
					</p>
					<RedirectButton
						variant="cta"
						href={`/profiles/${profile.id}/festivals/${festival.id}/reservations/new`}
					>
						Reservar espacio
						<ArrowRightIcon className="ml-2 w-4 h-4" />
					</RedirectButton>
				</CardContent>
			</Card>
		);
	}

	// User HAS a reservation - find it
	const participation = profile.participations.find(
		(p) =>
			p.reservation.festivalId === festival.id &&
			p.reservation.status !== "rejected",
	);

	if (!participation) {
		// Rejected reservation
		const rejectedParticipation = profile.participations.find(
			(p) =>
				p.reservation.festivalId === festival.id &&
				p.reservation.status === "rejected",
		);

		if (rejectedParticipation) {
			return (
				<Card className="border-red-200">
					<CardContent className="pt-4">
						<div className="flex items-start gap-3">
							<CircleAlertIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
							<div>
								<p className="font-medium">
									{festival.name}
								</p>
								<p className="text-sm text-muted-foreground mt-1">
									Tu reserva fue cancelada. Contacta a los
									organizadores si tenés alguna consulta.
								</p>
								<ReservationStatusBadge
									status="rejected"
									className="mt-2"
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			);
		}

		return null;
	}

	const { reservation } = participation;

	// Fetch invoices to check payment status
	let hasPendingPayment = false;
	try {
		const invoices = await fetchInvoicesByReservation(reservation.id);
		hasPendingPayment = invoices.some(
			(invoice) => invoice.status === "pending",
		);
	} catch {
		// Silently fail - payment status just won't be shown
	}

	const isConfirmed = reservation.status === "accepted";

	return (
		<Card className={isConfirmed ? "border-green-200" : undefined}>
			<CardHeader
				className={
					isConfirmed
						? "bg-gradient-to-r from-green-600 to-green-500 text-white rounded-t-lg"
						: "bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-lg"
				}
			>
				<div className="flex items-center justify-between">
					<CardTitle
						className={`text-lg md:text-xl ${isConfirmed ? "text-white" : ""}`}
					>
						{festival.name}
					</CardTitle>
					<ReservationStatusBadge status={reservation.status} />
				</div>
				<div
					className={`flex flex-col sm:flex-row gap-1 text-sm ${isConfirmed ? "text-green-100" : "text-muted-foreground"}`}
				>
					{dateLabel && (
						<span className="flex items-center gap-1">
							<CalendarIcon className="w-4 h-4" />
							{dateLabel}
						</span>
					)}
					{festival.locationLabel && (
						<span className="flex items-center gap-1">
							<MapPinIcon className="w-4 h-4" />
							{festival.locationLabel}
						</span>
					)}
				</div>
			</CardHeader>
			<CardContent className="pt-4 space-y-3">
				<div className="flex items-center gap-2 text-sm">
					<LandPlotIcon className="w-4 h-4 text-muted-foreground" />
					<span>
						Espacio {reservation.stand.label}
						{reservation.stand.standNumber}
					</span>
				</div>

				{hasPendingPayment && (
					<div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-800">
						<CircleAlertIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
						<div>
							<p className="text-sm font-medium">
								Tenés un pago pendiente
							</p>
							<RedirectButton
								href={`/profiles/${profile.id}/festivals/${festival.id}/reservations/${reservation.id}/payments`}
								className="text-amber-900 hover:text-amber-900 mt-1 p-0 h-auto"
								variant="link"
								size="sm"
							>
								Ir a pagos
								<ArrowRightIcon className="ml-1 w-4 h-4" />
							</RedirectButton>
						</div>
					</div>
				)}

				{isConfirmed && (
					<div className="flex items-center gap-2 text-sm text-green-700">
						<PartyPopperIcon className="w-4 h-4" />
						<span>Tu participación está confirmada</span>
					</div>
				)}

				<RedirectButton
					href="/my_participations"
					variant="outline"
					size="sm"
				>
					Ver detalles
					<ArrowRightIcon className="ml-2 w-4 h-4" />
				</RedirectButton>
			</CardContent>
		</Card>
	);
}
