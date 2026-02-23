"use client";

import { ArrowRight, Maximize2Icon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { createStandHold } from "@/app/lib/stands/hold-actions";
import { ProfileType } from "@/app/api/users/definitions";
import CategoryBadge from "@/app/components/category-badge";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { profileHasReservation } from "@/app/helpers/next_event";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { canStandBeReserved } from "@/app/lib/stands/helpers";
import { toast } from "sonner";

type ActiveHold = { id: number; standId: number } | null;

type StandInfoCardProps = {
	stand: StandWithReservationsWithParticipants;
	sectorName: string;
	profile: ProfileType;
	festival: FestivalBase;
	activeHold?: ActiveHold;
	onHoldChange?: (hold: ActiveHold) => void;
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
	activeHold?: ActiveHold,
): string | null {
	if (stand.status === "disabled") return "Espacio deshabilitado";
	if (stand.status === "held" && stand.id !== activeHold?.standId)
		return "Espacio en espera por otro participante";
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
	if (stand.standSubcategories.length > 0) {
		const userSubcategoryIds = profile.profileSubcategories.map(
			(ps) => ps.subcategoryId,
		);
		const hasMatch = userSubcategoryIds.some((id) =>
			stand.standSubcategories.some((sc) => sc.subcategoryId === id),
		);
		if (!hasMatch) return "No puedes reservar en este espacio";
	}
	if (profileHasReservation(profile, festivalId))
		return "Ya tienes una reserva en este festival";
	return null;
}

export function StandInfoCard({
	stand,
	sectorName,
	profile,
	festival,
	activeHold,
	onHoldChange,
	onClose,
}: StandInfoCardProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isOwnHold = stand.status === "held" && stand.id === activeHold?.standId;

	const isStandTaken =
		stand.status === "reserved" ||
		stand.status === "confirmed" ||
		(stand.status === "held" && !isOwnHold);

	const userSubcategoryIds = profile.profileSubcategories.map(
		(ps) => ps.subcategoryId,
	);
	const canReserve =
		!isStandTaken &&
		!isOwnHold &&
		(profile.role === "admin" ||
			(canStandBeReserved(stand, profile, userSubcategoryIds) &&
				isProfileInFestival(festival.id, profile) &&
				!profileHasReservation(profile, festival.id)));

	const eligibilityMessage = getEligibilityMessage(
		stand,
		profile,
		festival.id,
		activeHold,
	);
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

		try {
			const res = await createStandHold(stand.id, profile.id, festival.id);
			if (res.success && res.holdId) {
				onHoldChange?.({ id: res.holdId, standId: stand.id });
				onClose();
				router.replace(
					`/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${stand.festivalSectorId}/confirm/${res.holdId}`,
				);
			} else {
				toast.error(res.message);
			}
		} catch {
			toast.error("No se pudo reservar el espacio temporalmente");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleContinueToHold = () => {
		if (!activeHold) return;
		onClose();
		router.replace(
			`/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${stand.festivalSectorId}/confirm/${activeHold.id}`,
		);
	};

	return (
		<div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up-fast md:bottom-6 md:left-auto md:right-6 md:w-[400px]">
			<div className="bg-card rounded-xl border border-border shadow-lg flex flex-col">
				<Button
					className="self-end m-2 text-muted-foreground"
					variant="ghost"
					size="sm"
					onClick={onClose}
					aria-label="Cerrar"
				>
					<X className="h-4 w-4 mr-1" />
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
									<span
										className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
											stand.status === "held"
												? "bg-amber-50 text-amber-600"
												: "bg-red-50 text-red-600"
										}`}
									>
										{stand.status === "held" ? "EN ESPERA" : "OCUPADO"}
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

					{/* Stand held by current user */}
					{isOwnHold && (
						<div className="rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-4">
							<p className="text-sm text-amber-800">
								Tienes este espacio reservado temporalmente. Confirma tu reserva
								antes de que expire.
							</p>
						</div>
					)}

					{/* Stand held by another user */}
					{stand.status === "held" && !isOwnHold && (
						<div className="rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-4">
							<p className="text-sm text-amber-800">
								Otro participante está considerando este espacio. Volverá a
								estar disponible en breve.
							</p>
						</div>
					)}

					{/* Stand taken - show reserver info */}
					{isStandTaken && stand.status !== "held" && standReservation && (
						<div className="rounded-r-lg border-l-4 border-red-500 bg-red-50 p-4">
							<div className="mb-3 space-y-2">
								{standReservation.participants.map((participant) => (
									<div key={participant.id} className="flex items-center gap-3">
										<Avatar className="h-12 w-12 border-red-200">
											<AvatarImage
												src={participant.user?.imageUrl}
												alt={participant.user?.displayName || "Participante"}
											/>
										</Avatar>
										<div className="flex-1">
											<p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-red-600">
												Reservado por
											</p>
											<p className="text-base font-bold text-gray-900">
												{participant.user?.displayName || "Participante"}
											</p>
										</div>
									</div>
								))}
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
					{isOwnHold ? (
						<Button type="button" onClick={handleContinueToHold}>
							<span>Continuar con tu reserva</span>
							<ArrowRight className="h-4 w-4" />
						</Button>
					) : canReserve ? (
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
