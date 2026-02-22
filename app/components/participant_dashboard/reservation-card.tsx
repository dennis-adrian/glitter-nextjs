import {
	AlertCircleIcon,
	ArrowRightIcon,
	CalendarClockIcon,
	CheckCircle2Icon,
	ClockIcon,
	FileTextIcon,
	HelpCircleIcon,
	HourglassIcon,
	LucideIcon,
	XCircleIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Participation, ProfileType } from "@/app/api/users/definitions";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import Image from "next/image";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { Banner, BannerVariant } from "@/app/components/ui/banner";
import Heading from "@/app/components/atoms/heading";
import { UserRequestBase } from "@/app/api/user_requests/definitions";
import { cn } from "@/app/lib/utils";
import { ReservationBase } from "@/app/api/reservations/definitions";

type Props = {
	profile: ProfileType;
	activeFestival: FestivalWithDates;
	activeParticipation: Participation | null | undefined;
	profileEnrollment: UserRequestBase;
};

type CardConfig = {
	icon: LucideIcon;
	label: string;
	badgeStyle: string;
	banner?: {
		title: string;
		description: string;
		variant: BannerVariant;
	};
};

const STATUS_CONFIG: Record<CardStatus, CardConfig> = {
	pending_enrollment: {
		icon: HelpCircleIcon,
		label: "Sin postulación",
		badgeStyle: "bg-gray-500/10 text-gray-700 border-gray-500/20",
	},
	rejected_enrollment: {
		icon: XCircleIcon,
		label: "Postulación rechazada",
		badgeStyle: "bg-red-500/10 text-red-700 border-red-500/20",
	},
	enrollment_pending_approval: {
		icon: HourglassIcon,
		label: "Postulación en revisión",
		badgeStyle: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
	},
	approved_enrollment: {
		icon: CheckCircle2Icon,
		label: "Habilitado para reservar",
		badgeStyle: "bg-green-100 text-green-700 border-green-300",
	},
	waiting_for_reservations: {
		icon: CalendarClockIcon,
		label: "Esperando apertura de reservas",
		badgeStyle: "bg-purple-500/10 text-purple-700 border-purple-500/20",
	},
	pending_payment: {
		icon: AlertCircleIcon,
		label: "Pago pendiente",
		badgeStyle: "bg-orange-500/10 text-orange-700 border-orange-500/20",
	},
	pending_payment_approval: {
		icon: ClockIcon,
		label: "Pago en revisión",
		badgeStyle: "bg-blue-500/10 text-blue-700 border-blue-500/20",
	},
	confirmed_reservation: {
		icon: CheckCircle2Icon,
		label: "Reserva confirmada",
		badgeStyle: "bg-green-600/10 text-green-800 border-green-600/20",
	},
	rejected_reservation: {
		icon: XCircleIcon,
		label: "Reserva rechazada",
		badgeStyle: "bg-red-600/10 text-red-800 border-red-600/20",
	},
};

type CardStatus =
	| "pending_enrollment"
	| "rejected_enrollment"
	| "enrollment_pending_approval"
	| "approved_enrollment"
	| "waiting_for_reservations"
	| "pending_payment"
	| "pending_payment_approval"
	| "confirmed_reservation"
	| "rejected_reservation";

function getCardStatus(
	profileEnrollment: UserRequestBase,
	activeParticipation: Participation | null | undefined,
	festivalReservationsStartDate: Date,
): CardStatus {
	if (activeParticipation?.reservation.status === "pending") {
		return "pending_payment";
	}
	if (activeParticipation?.reservation.status === "verification_payment") {
		return "pending_payment_approval";
	}
	if (activeParticipation?.reservation.status === "accepted") {
		return "confirmed_reservation";
	}
	if (activeParticipation?.reservation.status === "rejected") {
		return "rejected_reservation";
	}
	if (profileEnrollment.status === "rejected") {
		return "rejected_enrollment";
	}
	if (profileEnrollment.status === "pending") {
		return "enrollment_pending_approval";
	}
	if (profileEnrollment.status === "accepted") {
		const reservationsDate = formatDate(festivalReservationsStartDate);

		if (DateTime.now() < reservationsDate) {
			return "waiting_for_reservations";
		}

		return "approved_enrollment";
	}

	return "pending_enrollment";
}

const getCardConfig = (
	cardStatus: CardStatus,
	reservationsStartDate: Date,
	reservation?: ReservationBase | null,
): CardConfig => {
	if (cardStatus === "enrollment_pending_approval") {
		return {
			...STATUS_CONFIG[cardStatus],
			banner: {
				title: "El equipo está revisando tu postulación",
				description:
					"Te avisaremos por correo electrónico cuando se tome una decisión.",
				variant: "info",
			},
		};
	}

	if (cardStatus === "waiting_for_reservations") {
		return {
			...STATUS_CONFIG[cardStatus],
			banner: {
				title: "Habilitación de reservas",
				description: `Las reservas se habilitarán el ${formatDate(
					reservationsStartDate,
				).toLocaleString({
					day: "2-digit",
					month: "long",
				})} a las ${formatDate(reservationsStartDate).toLocaleString(DateTime.TIME_SIMPLE)}.`,
				variant: "primary",
			},
		};
	}

	if (cardStatus === "approved_enrollment") {
		return {
			...STATUS_CONFIG[cardStatus],
			banner: {
				title: "Ya podés reservar tu stand",
				description:
					"Hacé tu reserva ahora para asegurarte de tener tu espacio.",
				variant: "primary",
			},
		};
	}

	if (reservation && cardStatus === "pending_payment") {
		const paymentDueDate = formatDate(reservation.createdAt).plus({ days: 5 });
		const dueDateLabel = paymentDueDate.toLocaleString(DateTime.DATE_MED);
		const dueDateTimeLabel = paymentDueDate.toLocaleString(
			DateTime.TIME_SIMPLE,
		);

		return {
			...STATUS_CONFIG[cardStatus],
			banner: {
				title: "Hacé tu pago para confirmar tu reserva",
				description: `Hiciste tu reserva pero aún no estás confirmada. Tenés hasta el ${dueDateLabel} a las ${dueDateTimeLabel} para confirmar tu reserva.`,
				variant: "warning",
			},
		};
	}

	return STATUS_CONFIG[cardStatus];
};

export default function ReservationCard({
	profile,
	activeFestival,
	activeParticipation,
	profileEnrollment,
}: Props) {
	const cardStatus = getCardStatus(
		profileEnrollment,
		activeParticipation,
		activeFestival.reservationsStartDate,
	);

	const nonCardStatuses: CardStatus[] = [
		"pending_enrollment",
		"rejected_reservation",
	];
	const nonActionsCardStatuses: CardStatus[] = [
		"rejected_enrollment",
		"rejected_reservation",
	];
	const hasReservationCardStatuses: CardStatus[] = [
		"pending_payment",
		"pending_payment_approval",
		"confirmed_reservation",
	];

	if (nonCardStatuses.includes(cardStatus)) {
		return null;
	}

	const cardConfig = getCardConfig(
		cardStatus,
		activeFestival.reservationsStartDate,
		activeParticipation?.reservation,
	);

	const actionHref =
		cardStatus === "pending_payment"
			? activeParticipation?.reservation?.id != null
				? `/profiles/${profile.id}/festivals/${activeFestival.id}/reservations/${activeParticipation.reservation.id}/payments`
				: `/my_participations`
			: hasReservationCardStatuses.includes(cardStatus)
				? `/my_participations`
				: `/profiles/${profile.id}/festivals/${activeFestival.id}/reservations/new`;

	return (
		<Card className="overflow-hidden">
			<div className="aspect-3/1 relative overflow-hidden bg-muted">
				{activeFestival.thumbnailUrl ? (
					<Image
						src={activeFestival.thumbnailUrl}
						alt="thumbnail del festival"
						fill
						className="object-center object-cover"
					/>
				) : (
					<div
						className={`w-full h-full bg-linear-to-r from-amber-600 to-amber-400`}
					/>
				)}
			</div>
			<CardContent className="p-4 md:p-5 flex flex-col gap-2 md:gap-3">
				<div className="flex flex-col gap-1">
					<Heading level={3} className="leading-none">
						{activeFestival.name}
					</Heading>
					<p className="text-sm text-muted-foreground">
						{getFestivalDateLabel(activeFestival, true)}
					</p>
				</div>

				<Badge className={cn("flex items-center gap-1", cardConfig.badgeStyle)}>
					<cardConfig.icon className="w-3.5 h-3.5 shrink-0" />
					{cardConfig.label}
				</Badge>

				{cardConfig.banner && (
					<Banner
						className="my-2"
						variant={cardConfig.banner.variant}
						title={cardConfig.banner.title}
					>
						<p>{cardConfig.banner.description}</p>
					</Banner>
				)}

				{!nonActionsCardStatuses.includes(cardStatus) && (
					<div className="flex flex-col items-center gap-1 w-full mt-2">
						<Button asChild variant="default" size="sm" className="w-full">
							<Link href={actionHref}>
								{cardStatus === "pending_payment"
									? "Completar el pago"
									: hasReservationCardStatuses.includes(cardStatus)
										? "Ver mi reserva"
										: "Ir a página de reservas"}
								<ArrowRightIcon className="w-3.5 h-3.5 shrink-0 ml-1" />
							</Link>
						</Button>
						<Button
							asChild
							variant="link"
							size="sm"
							className="text-muted-foreground"
						>
							<Link
								href={`/profiles/${profile.id}/festivals/${activeFestival.id}/terms`}
							>
								<FileTextIcon className="w-3.5 h-3.5 shrink-0" />
								Términos y condiciones
							</Link>
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
