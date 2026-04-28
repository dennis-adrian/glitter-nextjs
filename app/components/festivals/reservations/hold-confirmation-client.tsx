"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";

import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import confetti from "canvas-confetti";
import { ArrowRight, TimerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { toast } from "sonner";

import { UserCategory } from "@/app/api/users/definitions";
import StepIndicator from "@/app/components/festivals/reservations/step-indicator";
import MapCanvas from "@/app/components/maps/map-canvas";
import {
	getStandFillColor,
	getStandStrokeColor,
	getStandTextColor,
	SELECTED_FILL,
	SELECTED_RING,
	SELECTED_STROKE,
	SELECTED_TEXT,
	STAND_SIZE,
} from "@/app/components/maps/map-utils";
import { Button } from "@/app/components/ui/button";
import { type SearchOption } from "@/app/components/ui/search-input/search-content";
import { searchPotentialPartners } from "@/app/lib/festivals/actions";
import {
	cancelStandHold,
	confirmStandHold,
} from "@/app/lib/stands/hold-actions";
import PartnerSelection from "./partner-selection";
import { RecentSharedStandPartner } from "@/app/lib/festivals/definitions";
import { cn } from "@/app/lib/utils";

const TERMS_AND_CONDITIONS_REASON =
	"No ha aceptado los términos y condiciones del festival";
const RESERVED_STAND_REASON = "Ya tiene una reserva en este festival";
const UNAVAILABLE_PARTNER_REASON = "No está disponible para compartir espacio";

type ThumbnailStand = {
	id: number;
	status: string;
	positionLeft: number | null;
	positionTop: number | null;
	label: string | null;
	standNumber: number;
};

type HoldConfirmationClientProps = {
	recentPartners: RecentSharedStandPartner[];
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
	festival,
	hold,
	mapBounds,
	profile,
	recentPartners,
	sectorId,
	sectorName,
	sectorStands,
	stand,
}: HoldConfirmationClientProps) {
	const router = useRouter();
	const [isSubmitting, startSubmitTransition] = useTransition();
	const [selectedPartnerId, setSelectedPartnerId] = useState<
		number | undefined
	>();
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
			try {
				setIsSearching(true);
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
							? TERMS_AND_CONDITIONS_REASON
							: undefined,
					})),
				);
			} finally {
				setIsSearching(false);
			}
		},
		[festival.id, profile.id],
	);

	const defaultPartnerOptions = useMemo(() => {
		return recentPartners.map((partner): SearchOption => {
			const isUnavailableByProfile = !partner.isSelectable;
			const disabled =
				partner.isReserved || !partner.isEligible || isUnavailableByProfile;
			let disabledReason: string | undefined;

			if (partner.isReserved) {
				disabledReason = RESERVED_STAND_REASON;
			} else if (!partner.isEligible) {
				disabledReason = TERMS_AND_CONDITIONS_REASON;
			} else if (isUnavailableByProfile) {
				disabledReason = UNAVAILABLE_PARTNER_REASON;
			}

			return {
				label: partner.displayName || "Sin nombre",
				value: String(partner.id),
				imageUrl: partner.imageUrl,
				disabled,
				disabledReason,
			};
		});
	}, [recentPartners]);

	const handleRefreshPartners = () => {
		startRefreshTransition(() => {
			router.refresh();
		});
		// Re-search after a short delay to allow refresh to propagate
		// or consider moving the search inside the transition
		setTimeout(() => {
			if (lastSearchTermRef.current.trim()) {
				handlePartnerSearch(lastSearchTermRef.current);
			}
		}, 100);
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

	const handleConfirm = () => {
		if (isSubmitting) return;
		startSubmitTransition(async () => {
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
					posthog.capture(POSTHOG_EVENTS.RESERVATION_CONFIRMED, {
						festival_id: festival.id,
						festival_name: festival.name,
						stand_id: stand.id,
						stand_number: stand.standNumber,
						stand_price: stand.price,
						profile_category: profile.category,
						has_partner: !!selectedPartnerId,
						reservation_id: res.reservationId,
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
			}
		});
	};

	const handleCancel = () => {
		if (isSubmitting) return;
		startSubmitTransition(async () => {
			try {
				await cancelStandHold(hold.id, profile.id);
				posthog.capture(POSTHOG_EVENTS.RESERVATION_CANCELLED, {
					festival_id: festival.id,
					festival_name: festival.name,
					stand_id: stand.id,
					stand_number: stand.standNumber,
					profile_category: profile.category,
				});
				toast.info("Reserva temporal cancelada", {
					duration: 2000,
				});
				router.replace(mapUrl);
			} catch {
				toast.error("Error al cancelar");
			}
		});
	};

	const isExpired = remainingSeconds === 0;
	const allKnownPartnerOptions = [
		...defaultPartnerOptions,
		...dynamicPartnerOptions.filter(
			(dynamicOption) =>
				!defaultPartnerOptions.some(
					(defaultOption) => defaultOption.value === dynamicOption.value,
				),
		),
	];
	const selectedPartner = selectedPartnerId
		? allKnownPartnerOptions.find((o) => o.value === String(selectedPartnerId))
		: undefined;

	return (
		<div className="flex min-h-[calc(100dvh-4rem)] flex-col">
			<StepIndicator
				step={2}
				totalSteps={3}
				backLabel="Volver al mapa"
				onBack={() => handleCancel()}
			/>
			<div className="flex-1 px-4 py-4 md:py-6">
				<div>
					{/* Countdown banner */}
					<div className="flex flex-col items-end">
						<p
							className={cn(
								"text-xs text-amber-800",
								remainingSeconds <= 30 ? "text-destructive" : "text-amber-800",
							)}
						>
							Te quedan
						</p>
						<div
							className={cn(
								"flex items-center gap-1",
								remainingSeconds <= 30 ? "text-destructive" : "text-amber-800",
							)}
						>
							<TimerIcon className={`h-5 w-5`} />
							<span className={`text-xl font-bold font-mono`}>
								{formatTime(remainingSeconds)}
							</span>
						</div>
					</div>

					{/* Resumen de Reserva */}
					<h2 className="text-lg font-semibold mb-3">Resumen de Reserva</h2>
					<div className="rounded-xl border bg-card shadow-sm p-6 mb-3">
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
						<PartnerSelection
							options={dynamicPartnerOptions}
							defaultOptions={defaultPartnerOptions}
							isRefreshing={isRefreshing}
							isSearching={isSearching}
							onPartnerSearch={handlePartnerSearch}
							onRefreshPartners={handleRefreshPartners}
							onSelectPartner={setSelectedPartnerId}
							selectedPartner={selectedPartner}
						/>
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
		</div>
	);
}
