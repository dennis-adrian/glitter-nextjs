"use client";

import confetti from "canvas-confetti";
import { ArrowRight, Maximize2Icon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
	createReservation,
	NewStandReservation,
} from "@/app/api/user_requests/actions";
import { ProfileType } from "@/app/api/users/definitions";
import CategoryBadge from "@/app/components/category-badge";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { profileHasReservation } from "@/app/helpers/next_event";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { canStandBeReserved } from "@/app/lib/stands/helpers";

type StandInfoCardProps = {
	stand: StandWithReservationsWithParticipants;
	sectorName: string;
	profile: ProfileType;
	festival: FestivalBase;
	onClose: () => void;
};

function getStandDimensions(
	standCategory: StandWithReservationsWithParticipants["standCategory"],
): string {
	if (standCategory === "gastronomy") return "80cm x 100cm";
	return "60cm x 120cm";
}

function getReservationStatusLabel(status: string): string {
	switch (status) {
		case "accepted":
			return "Confirmada";
		case "verification_payment":
			return "En verificación";
		case "pending":
			return "Pendiente";
		default:
			return "Procesando";
	}
}

function getEligibilityMessage(
	stand: StandWithReservationsWithParticipants,
	profile: ProfileType,
	festivalId: number,
): string | null {
	if (stand.status === "disabled") return "Espacio deshabilitado";
	if (!isProfileInFestival(festivalId, profile))
		return "No estás habilitado para participar en este evento";
	if (
		profile.category !== stand.standCategory &&
		profile.category !== "new_artist"
	)
		return "No puedes reservar en este espacio";
	if (
		profile.category === "new_artist" &&
		stand.standCategory !== "illustration"
	)
		return "No puedes reservar en este espacio";
	if (profileHasReservation(profile, festivalId))
		return "Ya tienes una reserva en este festival";
	return null;
}

export function StandInfoCard({
	stand,
	sectorName,
	profile,
	festival,
	onClose,
}: StandInfoCardProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isStandTaken =
		stand.status === "reserved" || stand.status === "confirmed";

	const canReserve =
		!isStandTaken &&
		(profile.role === "admin" ||
			(canStandBeReserved(stand, profile) &&
				isProfileInFestival(festival.id, profile) &&
				!profileHasReservation(profile, festival.id)));

	const eligibilityMessage = getEligibilityMessage(stand, profile, festival.id);
	const hasReservation = profileHasReservation(profile, festival.id);
	const standReservation = stand.reservations?.find(
		(r) => r.status !== "rejected",
	);

	const formatPrice = (price: number) =>
		new Intl.NumberFormat("es-BO", {
			style: "currency",
			currency: "BOB",
			minimumFractionDigits: 0,
		}).format(price);

	const dimensions = getStandDimensions(stand.standCategory);

	const handleSelectStand = async () => {
		if (!canReserve || isSubmitting) return;
		setIsSubmitting(true);
		const reservation = {
			standId: stand.id,
			festivalId: festival.id,
			participantIds: [profile.id],
		} as NewStandReservation;
		const res = await createReservation(reservation, stand.price, profile);
		setIsSubmitting(false);
		if (res.success) {
			onClose();
			confetti({
				particleCount: 100,
				spread: 70,
				origin: { y: 0.6 },
			});
			const { toast } = await import("sonner");
			toast.success(res.message);
			router.push(
				`/profiles/${profile.id}/festivals/${festival.id}/reservations/${res.reservationId}/payments`,
			);
		} else {
			const { toast } = await import("sonner");
			toast.error(res.message, { description: res.description });
		}
	};

	return (
		<div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up md:bottom-6 md:left-auto md:right-6 md:w-[400px]">
			<div className="bg-card rounded-xl border border-border shadow-lg flex flex-col">
				<Button
					className="self-end m-2 text-muted-foreground"
					variant="ghost"
					size="sm"
					onClick={onClose}
					aria-label="Cerrar"
				>
					<X className="h-4 w-4" />
					Cerrar
				</Button>

				<div className="px-6 pb-6 flex flex-col gap-6">
					{/* Header with category and price */}
					<div className="flex items-start justify-between">
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<CategoryBadge
									category={stand.standCategory}
									className="text-[9px] font-bold uppercase tracking-wide"
								/>
								{isStandTaken && (
									<span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-600">
										OCUPADO
									</span>
								)}
							</div>
							<div className="flex items-baseline gap-2">
								<h4 className="text-xl font-bold">
									Stand #{(stand.label ?? "") + stand.standNumber}
								</h4>
								<span className="text-sm sm:text-base text-muted-foreground">
									<span className="hidden sm:block">Sector</span> {sectorName}
								</span>
							</div>
						</div>
						{!isStandTaken && (
							<div className="text-right">
								<p className="text-xs font-medium text-[#6b7280]">
									Precio Final
								</p>
								<p className="text-xl font-bold text-primary">
									{formatPrice(stand.price)}
								</p>
							</div>
						)}
					</div>

					{/* Details */}
					<div className="flex items-center gap-3">
						<Badge variant="outline">
							<Maximize2Icon className="h-3 w-3 mr-2 text-muted-foreground" />
							<span className="text-sm text-muted-foreground font-normal">
								{dimensions}
							</span>
						</Badge>
					</div>

					{/* Stand taken - show reserver info */}
					{isStandTaken && standReservation && (
						<div className="rounded-r-lg border-l-4 border-red-500 bg-red-50 p-4">
							<div className="mb-3 flex items-center gap-3">
								<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
									<span className="text-lg font-bold text-red-700">
										{standReservation.participants[0]?.user?.displayName?.charAt(
											0,
										) || "P"}
									</span>
								</div>
								<div className="flex-1">
									<p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-red-600">
										Reservado por
									</p>
									<p className="text-base font-bold text-gray-900">
										{standReservation.participants[0]?.user?.displayName ||
											"Participante"}
									</p>
								</div>
							</div>
							<div className="space-y-1.5 text-sm">
								<div className="flex items-center justify-between">
									<span className="text-gray-600">Estado:</span>
									<span className="font-semibold text-gray-900">
										{getReservationStatusLabel(standReservation.status)}
									</span>
								</div>
							</div>
						</div>
					)}

					{/* Error message if not eligible (skip when message is already-reservation; shown in blue box below) */}
					{!canReserve &&
						!isStandTaken &&
						eligibilityMessage &&
						!hasReservation && (
							<div className="rounded-lg border border-red-200 bg-red-50 p-3">
								<p className="text-sm text-red-800">{eligibilityMessage}</p>
							</div>
						)}

					{/* Already have reservation message */}
					{hasReservation && !isStandTaken && (
						<div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
							<p className="text-sm text-blue">
								Ya tienes una reserva en este festival
							</p>
						</div>
					)}

					{/* Action button */}
					{canReserve ? (
						<Button
							type="button"
							onClick={handleSelectStand}
							disabled={isSubmitting}
						>
							<span>Seleccionar Stand</span>
							<ArrowRight className="h-4 w-4" />
						</Button>
					) : (
						<Button
							type="button"
							disabled
							className="h-12 w-full cursor-not-allowed rounded-lg bg-gray-200 text-gray-500"
						>
							{isStandTaken
								? "Stand No Disponible"
								: "No disponible para reservar"}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
