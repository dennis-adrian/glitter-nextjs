"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { ArrowRight, Timer, X } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import SearchInput from "@/app/components/ui/search-input/input";
import { Label } from "@/app/components/ui/label";
import MapCanvas from "@/app/components/maps/map-canvas";
import {
	STAND_SIZE,
	getStandFillColor,
	getStandStrokeColor,
	getStandTextColor,
	SELECTED_FILL,
	SELECTED_STROKE,
	SELECTED_TEXT,
	SELECTED_RING,
} from "@/app/components/maps/map-utils";
import { UserCategory } from "@/app/api/users/definitions";
import {
	confirmStandHold,
	cancelStandHold,
} from "@/app/lib/stands/hold-actions";

type ThumbnailStand = {
	id: number;
	status: string;
	positionLeft: number | null;
	positionTop: number | null;
	label: string | null;
	standNumber: number;
};

type HoldConfirmationClientProps = {
	hold: {
		id: number;
		expiresAt: string;
	};
	stand: {
		id: number;
		label: string | null;
		standNumber: number;
		standCategory: UserCategory;
		price: number;
	};
	sectorName: string;
	sectorStands: ThumbnailStand[];
	mapBounds: { minX: number; minY: number; width: number; height: number };
	festival: {
		id: number;
		name: string;
	};
	profile: {
		id: number;
		displayName: string | null;
		category: UserCategory;
		imageUrl: string | null;
	};
	sectorId: number;
	partnerOptions: {
		label: string;
		value: string;
		imageUrl?: string | null;
	}[];
};

const CORNER_RADIUS = 0.8;
const RING_PADDING = 0.8;

function StandMapThumbnail({
	stands,
	selectedStandId,
	mapBounds,
}: {
	stands: ThumbnailStand[];
	selectedStandId: number;
	mapBounds: { minX: number; minY: number; width: number; height: number };
}) {
	const positioned = stands.filter(
		(s) => s.positionLeft != null && s.positionTop != null,
	);

	return (
		<MapCanvas
			config={mapBounds}
			className="w-full h-full rounded-lg overflow-hidden"
		>
			{positioned.map((s) => {
				const isSelected = s.id === selectedStandId;
				const left = s.positionLeft ?? 0;
				const top = s.positionTop ?? 0;

				const fillColor = isSelected
					? SELECTED_FILL
					: getStandFillColor(s.status, false);
				const strokeColor = isSelected
					? SELECTED_STROKE
					: getStandStrokeColor(s.status, false);
				const textColor = isSelected
					? SELECTED_TEXT
					: getStandTextColor(s.status, false);

				return (
					<g key={s.id} transform={`translate(${left}, ${top})`}>
						{isSelected && (
							<rect
								x={-RING_PADDING}
								y={-RING_PADDING}
								width={STAND_SIZE + RING_PADDING * 2}
								height={STAND_SIZE + RING_PADDING * 2}
								rx={CORNER_RADIUS + RING_PADDING * 0.5}
								fill={SELECTED_RING}
							/>
						)}
						<rect
							width={STAND_SIZE}
							height={STAND_SIZE}
							rx={CORNER_RADIUS}
							fill={fillColor}
							stroke={strokeColor}
							strokeWidth={isSelected ? 0.3 : 0.4}
						/>
						<text
							x={STAND_SIZE / 2}
							y={STAND_SIZE / 2}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={2.2}
							fontWeight={isSelected ? 700 : 600}
							fill={textColor}
							style={{
								pointerEvents: "none",
								userSelect: "none",
							}}
						>
							{s.label}
							{s.standNumber}
						</text>
					</g>
				);
			})}
		</MapCanvas>
	);
}

export default function HoldConfirmationClient({
	hold,
	stand,
	sectorName,
	sectorStands,
	mapBounds,
	festival,
	profile,
	sectorId,
	partnerOptions,
}: HoldConfirmationClientProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [selectedPartnerId, setSelectedPartnerId] = useState<
		number | undefined
	>();
	const [addPartner, setAddPartner] = useState(false);

	// Countdown timer
	const [remainingSeconds, setRemainingSeconds] = useState(() => {
		const diff = new Date(hold.expiresAt).getTime() - Date.now();
		return Math.max(0, Math.floor(diff / 1000));
	});

	useEffect(() => {
		if (remainingSeconds <= 0) return;

		const expiresAtMs = new Date(hold.expiresAt).getTime();
		const timer = setInterval(() => {
			const remaining = Math.max(
				0,
				Math.floor((expiresAtMs - Date.now()) / 1000),
			);
			setRemainingSeconds(remaining);
			if (remaining <= 0) clearInterval(timer);
		}, 1000);

		return () => clearInterval(timer);
	}, [remainingSeconds, hold.expiresAt]);

	// Auto-expire: when timer hits 0, cancel hold and redirect
	useEffect(() => {
		if (remainingSeconds === 0) {
			cancelStandHold(hold.id, profile.id).then(() => {
				toast.info("Tu reserva temporal expiró");
				router.push(
					`/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${sectorId}`,
				);
			});
		}
	}, [remainingSeconds, hold.id, profile.id, festival.id, sectorId, router]);

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const formatPrice = (price: number) =>
		new Intl.NumberFormat("es-BO", {
			style: "currency",
			currency: "BOB",
			minimumFractionDigits: 2,
		}).format(price);

	const handleConfirm = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			const res = await confirmStandHold(
				hold.id,
				profile.id,
				selectedPartnerId,
			);
			if (res.success && res.reservationId) {
				confetti({
					particleCount: 100,
					spread: 70,
					origin: { y: 0.6 },
				});
				toast.success(res.message);
				router.push(
					`/profiles/${profile.id}/festivals/${festival.id}/reservations/${res.reservationId}/payments`,
				);
			} else {
				toast.info(res.message);
				router.push(
					`/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${sectorId}`,
				);
			}
		} catch {
			toast.error("Error al confirmar la reserva");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancel = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			await cancelStandHold(hold.id, profile.id);
			toast.info("Reserva temporal cancelada");
			router.push(
				`/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${sectorId}`,
			);
		} catch {
			toast.error("Error al cancelar");
		} finally {
			setIsSubmitting(false);
		}
	};

	const isExpired = remainingSeconds === 0;

	return (
		<div className="container max-w-lg mx-auto p-4 md:p-6">
			{/* Countdown banner */}
			<div
				className={`rounded-lg p-4 mb-6 text-center ${
					remainingSeconds <= 30
						? "bg-red-50 border border-red-200"
						: "bg-amber-50 border border-amber-200"
				}`}
			>
				<div className="flex items-center justify-center gap-2 mb-1">
					<Timer
						className={`h-5 w-5 ${
							remainingSeconds <= 30
								? "text-red-600"
								: "text-amber-600"
						}`}
					/>
					<span
						className={`text-2xl font-bold font-mono ${
							remainingSeconds <= 30
								? "text-red-600"
								: "text-amber-800"
						}`}
					>
						{formatTime(remainingSeconds)}
					</span>
				</div>
				<p className="text-sm text-muted-foreground">
					Tu espacio está reservado temporalmente
				</p>
			</div>

			{/* Resumen de Reserva */}
			<h2 className="text-lg font-semibold mb-3">Resumen de Reserva</h2>
			<div className="rounded-xl border bg-card shadow-sm p-5 mb-6">
				<div className="flex gap-4">
					{/* Left: stand info */}
					<div className="flex-1 space-y-3">
						<div>
							<p className="text-xs text-muted-foreground">
								Stand seleccionado
							</p>
							<p className="text-base font-bold">
								Stand #
								{(stand.label ?? "") + stand.standNumber}
							</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">
								Ubicación
							</p>
							<p className="text-base font-bold">{sectorName}</p>
						</div>
					</div>

					{/* Right: map thumbnail */}
					<div className="w-24 h-24 shrink-0 rounded-lg border bg-muted/30 overflow-hidden">
						<StandMapThumbnail
							stands={sectorStands}
							selectedStandId={stand.id}
							mapBounds={mapBounds}
						/>
					</div>
				</div>

				{/* Price */}
				<div className="flex items-center justify-between mt-4 pt-4 border-t">
					<p className="text-sm text-muted-foreground">
						Total a pagar
					</p>
					<p className="text-xl font-bold text-primary">
						{formatPrice(stand.price)}
					</p>
				</div>
			</div>

			{/* Partner selection (illustration/new_artist only) */}
			{(profile.category === "illustration" ||
				profile.category === "new_artist") && (
				<div className="rounded-xl border bg-card shadow-sm p-6 mb-6">
					{addPartner ? (
						<div className="grid gap-2">
							<Label htmlFor="partner-search">
								Elige a tu compañero de espacio
							</Label>
							<SearchInput
								id="partner-search"
								options={partnerOptions}
								placeholder="Ingresa el nombre..."
								onSelect={(id) => setSelectedPartnerId(id)}
							/>
							{selectedPartnerId && (
								<Button
									variant="ghost"
									size="sm"
									className="self-start"
									onClick={() => {
										setSelectedPartnerId(undefined);
										setAddPartner(false);
									}}
								>
									<X className="h-4 w-4 mr-1" />
									Quitar compañero
								</Button>
							)}
						</div>
					) : (
						<div className="bg-amber-50 rounded-md p-4 md:p-6 border border-amber-200">
							<div className="flex flex-col md:flex-row items-center gap-1">
								<span>¿Compartes espacio?</span>
								<Button
									variant="link"
									onClick={() => setAddPartner(true)}
								>
									¡Haz click aquí!
								</Button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Action buttons */}
			<div className="flex flex-col gap-3">
				<Button
					onClick={handleConfirm}
					disabled={isSubmitting || isExpired}
					size="lg"
					className="w-full"
				>
					<span>Confirmar Reserva</span>
					<ArrowRight className="h-4 w-4 ml-2" />
				</Button>
				<Button
					variant="outline"
					onClick={handleCancel}
					disabled={isSubmitting}
					size="lg"
					className="w-full"
				>
					<X className="h-4 w-4 mr-2" />
					<span>Cancelar</span>
				</Button>
			</div>
		</div>
	);
}
