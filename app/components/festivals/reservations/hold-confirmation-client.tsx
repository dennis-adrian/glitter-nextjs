"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { ArrowRight, RefreshCw, TimerIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
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
import { cn } from "@/app/lib/utils";
import {
	confirmStandHold,
	cancelStandHold,
} from "@/app/lib/stands/hold-actions";
import { searchPotentialPartners } from "@/app/lib/festivals/actions";
import { type SearchOption } from "@/app/components/ui/search-input/search-content";
import StepIndicator from "@/app/components/festivals/reservations/step-indicator";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
} from "@/app/components/ui/alert-dialog";

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
}: HoldConfirmationClientProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [selectedPartnerId, setSelectedPartnerId] = useState<
		number | undefined
	>();
	const [addPartner, setAddPartner] = useState(false);
	const [showExitDialog, setShowExitDialog] = useState(false);
	const [isRefreshing, startRefreshTransition] = useTransition();
	const [dynamicPartnerOptions, setDynamicPartnerOptions] = useState<
		SearchOption[]
	>([]);
	const [isSearching, setIsSearching] = useState(false);
	const lastSearchTermRef = useRef("");

	const mapUrl = `/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${sectorId}`;

	const handlePartnerSearch = useCallback(
		async (term: string) => {
			lastSearchTermRef.current = term;
			if (!term.trim()) {
				setDynamicPartnerOptions([]);
				return;
			}
			setIsSearching(true);
			try {
				const results = await searchPotentialPartners(
					festival.id,
					profile.id,
					term,
				);
				setDynamicPartnerOptions(
					results.map((p) => ({
						label: p.displayName || "Sin nombre",
						value: String(p.id),
						imageUrl: p.imageUrl,
						disabled: !p.isEligible,
						disabledReason: !p.isEligible
							? "No ha aceptado los términos y condiciones del festival"
							: undefined,
					})),
				);
			} finally {
				setIsSearching(false);
			}
		},
		[festival.id, profile.id],
	);

	const handleRefreshPartners = () => {
		startRefreshTransition(() => {
			router.refresh();
		});
		if (lastSearchTermRef.current.trim()) {
			handlePartnerSearch(lastSearchTermRef.current);
		}
	};

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
		if (remainingSeconds === 0 && !isSubmitting) {
			let cancelled = false;
			(async () => {
				try {
					await cancelStandHold(hold.id, profile.id);
					toast.info("Tu reserva temporal expiró");
				} catch (error) {
					console.error("Error expiring hold", error);
					toast.error("No se pudo cancelar la reserva temporal");
				} finally {
					if (!cancelled) {
						router.replace(mapUrl);
					}
				}
			})();

			return () => {
				cancelled = true;
			};
		}
	}, [
		remainingSeconds,
		isSubmitting,
		hold.id,
		profile.id,
		festival.id,
		sectorId,
		router,
		mapUrl,
	]);

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
				router.replace(
					`/profiles/${profile.id}/festivals/${festival.id}/reservations/${res.reservationId}/payments`,
				);
			} else {
				toast.info(res.message);
				router.replace(mapUrl);
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
			toast.info("Reserva temporal cancelada", {
				duration: 2000,
			});
			router.replace(mapUrl);
		} catch {
			toast.error("Error al cancelar");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleExitConfirm = async () => {
		setShowExitDialog(false);
		await handleCancel();
	};

	const isExpired = remainingSeconds === 0;

	return (
		<div className="flex min-h-[calc(100dvh-4rem)] flex-col">
			<StepIndicator
				step={3}
				totalSteps={4}
				backLabel="Volver al mapa"
				onBack={() => setShowExitDialog(true)}
			/>
			<div className="flex-1 px-4 py-4 md:py-6">
				<div className="mx-auto max-w-lg">
					{/* Countdown banner */}
					<div
						className={`rounded-lg flex items-start gap-3 p-4 mb-4 md:mb-6 ${
							remainingSeconds <= 30
								? "bg-red-50 border border-red-200"
								: "bg-amber-50 border border-amber-200"
						}`}
					>
						<p className="text-sm text-muted-foreground">
							Confirmá tu reserva antes de que expire el tiempo
						</p>
						<div className="flex items-center gap-1">
							<TimerIcon
								className={`h-5 w-5 ${
									remainingSeconds <= 30 ? "text-red-600" : "text-amber-800"
								}`}
							/>
							<span
								className={`text-xl font-bold font-mono ${
									remainingSeconds <= 30 ? "text-red-600" : "text-amber-800"
								}`}
							>
								{formatTime(remainingSeconds)}
							</span>
						</div>
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
									<p className="text-lg font-bold text-primary">
										Stand #{(stand.label ?? "") + stand.standNumber}
									</p>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Ubicación</p>
									<p className="text-base font-bold">Sector {sectorName}</p>
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
							<p className="text-sm text-muted-foreground">Total a pagar</p>
							<p className="text-lg font-bold">{formatPrice(stand.price)}</p>
						</div>
					</div>

					{/* Partner selection (illustration/new_artist only) */}
					{(profile.category === "illustration" ||
						profile.category === "new_artist") && (
						<div className="rounded-xl border bg-card shadow-sm p-6 mb-6">
							{addPartner ? (
								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<Label htmlFor="partner-search">
											Elige a tu compañero de espacio
										</Label>
										{!selectedPartnerId && (
											<Button
												variant="ghost"
												size="icon"
												onClick={handleRefreshPartners}
												disabled={isRefreshing}
												aria-label="Actualizar lista"
											>
												<RefreshCw
													className={cn(
														"h-4 w-4",
														isRefreshing && "animate-spin",
													)}
												/>
											</Button>
										)}
									</div>
									{selectedPartnerId ? (
										(() => {
											const partner = dynamicPartnerOptions.find(
												(o) => o.value === String(selectedPartnerId),
											);
											return (
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-3">
														<Avatar>
															<AvatarImage
																src={partner?.imageUrl ?? undefined}
																alt="avatar"
															/>
														</Avatar>
														<span className="font-medium">
															{partner?.label}
														</span>
													</div>
													<Button
														size="icon"
														onClick={() => setSelectedPartnerId(undefined)}
														aria-label="Quitar compañero"
														className="text-destructive bg-card hover:bg-destructive hover:text-destructive-foreground transition-colors"
													>
														<Trash2Icon className="h-4 w-4" />
													</Button>
												</div>
											);
										})()
									) : (
										<SearchInput
											id="partner-search"
											options={dynamicPartnerOptions}
											placeholder="Ingresa el nombre..."
											onSearch={handlePartnerSearch}
										isLoading={isSearching}
											onSelect={(id) => {
												const parsed = typeof id === "string" ? Number(id) : id;
												setSelectedPartnerId(
													Number.isFinite(parsed) ? parsed : undefined,
												);
											}}
										/>
									)}
								</div>
							) : (
								<div className="bg-amber-50 rounded-md p-4 md:p-6 border border-amber-200">
									<div className="flex flex-col md:flex-row items-center gap-1">
										<span>¿Compartes espacio?</span>
										<Button variant="link" onClick={() => setAddPartner(true)}>
											¡Haz click aquí!
										</Button>
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Action buttons */}
			<div className="sticky bottom-0 border-t bg-background p-4">
				<div className="mx-auto max-w-lg flex gap-1">
					<Button
						className="shrink"
						variant="outline"
						onClick={handleCancel}
						disabled={isSubmitting}
					>
						<span>Cancelar</span>
					</Button>
					<Button
						className="flex-1"
						onClick={handleConfirm}
						disabled={isSubmitting || isExpired}
					>
						<span>Confirmar Reserva</span>
						<ArrowRight className="h-4 w-4 ml-2" />
					</Button>
				</div>
			</div>

			{/* Exit confirmation dialog */}
			<AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Salir de la confirmación?</AlertDialogTitle>
						<AlertDialogDescription>
							Se liberará tu espacio temporal y podrás elegir otro stand.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Quedarme</AlertDialogCancel>
						<Button onClick={handleExitConfirm} disabled={isSubmitting}>
							Sí, volver al mapa
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
