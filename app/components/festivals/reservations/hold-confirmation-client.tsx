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
import { AlertCircleIcon, ArrowRight, TimerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { toast } from "sonner";

import { UserCategory } from "@/app/api/users/definitions";
import StepIndicator from "@/app/components/festivals/reservations/step-indicator";
import { useScreenBack } from "@/app/components/navbar/screen-bar";
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
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { type SearchOption } from "@/app/components/ui/search-input/search-content";
import { LatestRequest } from "@/app/lib/reservations/latest-request";
import { searchPotentialPartners } from "@/app/lib/reservations/participant-actions";
import { RESERVATION_ERROR_MESSAGES } from "@/app/lib/reservations/errors";
import {
  cancelStandHold,
  confirmStandHold,
} from "@/app/lib/stands/hold-actions";
import PartnerSelection from "./partner-selection";
import { useHoldCountdown } from "./use-hold-countdown";
import type { PartnerSearchResultDto } from "@/app/lib/reservations/dto";
import { cn } from "@/app/lib/utils";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import {
  isStaleDeploymentError,
  toastActionError,
} from "@/app/lib/errors/action-error";

function partnerDisabledReason(
  denialCode: PartnerSearchResultDto["denialCode"],
) {
  if (!denialCode) return undefined;
  return RESERVATION_ERROR_MESSAGES[denialCode];
}

type ThumbnailStand = {
  id: number;
  status: string;
  positionLeft: number | null;
  positionTop: number | null;
  label: string | null;
  standNumber: number;
};

type HoldConfirmationClientProps = {
  recentPartners: PartnerSearchResultDto[];
  hold: {
    id: number;
    expiresAt: string;
    /** When the server read the hold; the countdown's clock. */
    serverNow: string;
  };
  /** What the hold really covers; `stand` is only the half picked first. */
  fullTable: {
    isFullTable: boolean;
    standLabels: string[];
    standIds: number[];
  };
  stand: {
    id: number;
    label: string | null;
    standNumber: number;
    standCategory: UserCategory;
    /** Billed when the participant books alone. */
    price: number;
    /** Billed instead once a partner is confirmed; null when none is configured. */
    sharedPrice: number | null;
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
  selectedStandIds,
  mapBounds,
}: {
  stands: ThumbnailStand[];
  /** Every stand the hold covers — two of them for a full table. */
  selectedStandIds: readonly number[];
  mapBounds: { minX: number; minY: number; width: number; height: number };
}) {
  const selected = new Set(selectedStandIds);
  const positioned = stands.filter(
    (s) => s.positionLeft != null && s.positionTop != null,
  );

  return (
    <MapCanvas
      config={mapBounds}
      className="w-full h-full rounded-lg overflow-hidden"
    >
      {positioned.map((s) => {
        const isSelected = selected.has(s.id);
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
  fullTable,
  hold,
  mapBounds,
  profile,
  recentPartners,
  sectorName,
  sectorStands,
  stand,
}: HoldConfirmationClientProps) {
  const router = useRouter();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [selectedPartnerId, setSelectedPartnerId] = useState<
    number | undefined
  >();

  // Confirmation bills the shared price as soon as a partner is on the
  // reservation, so the total shown has to follow the selection rather than
  // stay on the individual price.
  const sharesPrice = selectedPartnerId != null && stand.sharedPrice != null;
  const payableAmount = sharesPrice ? stand.sharedPrice! : stand.price;
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [dynamicPartnerOptions, setDynamicPartnerOptions] = useState<
    SearchOption[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const lastSearchTermRef = useRef("");
  const searchTrackerRef = useRef(new LatestRequest());

  // The map itself: `/sectors/{id}` only redirects here, a wasted round trip.
  const mapUrl = `/profiles/${profile.id}/festivals/${festival.id}/reservations/new`;
  const [releaseOpen, setReleaseOpen] = useState(false);

  const handlePartnerSearch = useCallback(
    async (term: string) => {
      const token = searchTrackerRef.current.next();
      lastSearchTermRef.current = term;
      if (!term.trim()) {
        if (searchTrackerRef.current.isCurrent(token)) {
          setDynamicPartnerOptions([]);
          setIsSearching(false);
        }
        return;
      }
      try {
        setIsSearching(true);
        const results = await searchPotentialPartners(festival.id, term);
        if (!searchTrackerRef.current.isCurrent(token)) return;
        setDynamicPartnerOptions(
          results.map((p) => ({
            label: p.displayName || "Sin nombre",
            value: String(p.id),
            imageUrl: p.imageUrl,
            disabled: !p.selectable,
            disabledReason: partnerDisabledReason(p.denialCode),
          })),
        );
      } finally {
        if (searchTrackerRef.current.isCurrent(token)) {
          setIsSearching(false);
        }
      }
    },
    [festival.id],
  );

  const defaultPartnerOptions = useMemo(() => {
    return recentPartners.map(
      (partner): SearchOption => ({
        label: partner.displayName || "Sin nombre",
        value: String(partner.id),
        imageUrl: partner.imageUrl,
        disabled: !partner.selectable,
        disabledReason: partnerDisabledReason(partner.denialCode),
      }),
    );
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

  // Display only, on the server's clock: expiry is the server's call.
  const remainingSeconds = useHoldCountdown(hold.expiresAt, hold.serverNow);

  // Set before every navigation away, so the expiry effect never replaces
  // the screen after another path already left it (e.g. a confirm that
  // succeeded as the clock reached 0).
  const leftRef = useRef(false);

  // At 0 the hold is already invisible to every server reader and the cron
  // removes the row within a minute; no round trip, and never a cancel from
  // the phone's clock.
  useEffect(() => {
    if (remainingSeconds !== 0 || isSubmitting || leftRef.current) return;
    leftRef.current = true;
    toast.info("Tu reserva temporal expiró", { duration: 8000 });
    router.replace(mapUrl);
  }, [remainingSeconds, isSubmitting, router, mapUrl]);

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

  // One key per (hold, partner) attempt: the server's request registry is
  // scoped to both, so a retry must resend the same partner with the same
  // key, and a different partner is a new request.
  const confirmIntentKeyRef = useRef(crypto.randomUUID());
  const lastAttemptPartnerRef = useRef<number | undefined | null>(null);
  // Consecutive retryable failures; some CONFLICT_RETRYs are deterministic.
  const retryCountRef = useRef(0);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // A thrown confirm rolled back, so the hold is still alive: stay here and
  // offer the same request again, up to three times in a row.
  const handleRetryableConfirmFailure = () => {
    retryCountRef.current += 1;
    if (retryCountRef.current >= 3) {
      toast.info(RESERVATION_ERROR_MESSAGES.CONFLICT_RETRY, { duration: 8000 });
      leftRef.current = true;
      router.replace(mapUrl);
      return;
    }
    setConfirmError(
      "No pudimos confirmar tu reserva. Tu espacio sigue en espera: intentá de nuevo.",
    );
  };

  const handleConfirm = () => {
    if (isSubmitting) return;
    if (
      lastAttemptPartnerRef.current !== null &&
      lastAttemptPartnerRef.current !== selectedPartnerId
    ) {
      confirmIntentKeyRef.current = crypto.randomUUID();
      retryCountRef.current = 0;
    }
    lastAttemptPartnerRef.current = selectedPartnerId;
    setConfirmError(null);
    startSubmitTransition(async () => {
      try {
        const res = await confirmStandHold({
          holdId: hold.id,
          partnerId: selectedPartnerId,
          idempotencyKey: confirmIntentKeyRef.current,
        });
        if (res.success && res.data.reservationId) {
          retryCountRef.current = 0;
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
          captureClientEvent(POSTHOG_EVENTS.RESERVATION_CONFIRMED, {
            festival_id: festival.id,
            festival_name: festival.name,
            stand_id: stand.id,
            stand_number: stand.standNumber,
            stand_price: payableAmount,
            profile_category: profile.category,
            has_partner: !!selectedPartnerId,
            reservation_id: res.data.reservationId,
          });
          toast.success(res.message);
          leftRef.current = true;
          router.replace(
            `/profiles/${profile.id}/festivals/${festival.id}/reservations/${res.data.reservationId}/payments`,
          );
        } else if (
          !res.success &&
          (res.code === "PARTNER_NOT_ELIGIBLE" ||
            res.code === "PARTNER_ALREADY_RESERVED")
        ) {
          toast.error(res.message, { duration: 8000 });
        } else if (!res.success && res.code === "CONFLICT_RETRY") {
          handleRetryableConfirmFailure();
        } else {
          toast.info(res.message, { duration: 8000 });
          leftRef.current = true;
          router.replace(mapUrl);
        }
      } catch (error) {
        // A tab on an old build fails every action until it reloads; a
        // retry cannot help, so that one keeps the reload notice.
        if (isStaleDeploymentError(error)) {
          toastActionError(error, "Error al confirmar la reserva", {
            duration: 8000,
          });
          return;
        }
        handleRetryableConfirmFailure();
      }
    });
  };

  const handleCancel = useCallback(() => {
    if (isSubmitting) return;
    startSubmitTransition(async () => {
      try {
        const res = await cancelStandHold(hold.id);
        if (res.success) {
          captureClientEvent(POSTHOG_EVENTS.RESERVATION_CANCELLED, {
            festival_id: festival.id,
            festival_name: festival.name,
            stand_id: stand.id,
            stand_number: stand.standNumber,
            profile_category: profile.category,
          });
          toast.info(res.message, {
            duration: 2000,
          });
          leftRef.current = true;
          router.replace(mapUrl);
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        toastActionError(error, "Error al cancelar");
      }
    });
  }, [
    isSubmitting,
    hold.id,
    festival.id,
    festival.name,
    stand.id,
    stand.standNumber,
    profile.category,
    router,
    mapUrl,
  ]);
  // Back goes to the map and keeps the hold: the held stand offers
  // "Continuar con tu reserva" there. Releasing is "Cancelar", which asks
  // first. The top bar needs the override — its default `router.back()`
  // would skip the map, which was reached with `replace`.
  const goToMap = useCallback(() => {
    leftRef.current = true;
    router.replace(mapUrl);
  }, [router, mapUrl]);
  useScreenBack(goToMap);

  const isExpired = remainingSeconds === 0;
  const allKnownPartnerOptions = useMemo(
    () => [
      ...defaultPartnerOptions,
      ...dynamicPartnerOptions.filter(
        (dynamicOption) =>
          !defaultPartnerOptions.some(
            (defaultOption) => defaultOption.value === dynamicOption.value,
          ),
      ),
    ],
    [defaultPartnerOptions, dynamicPartnerOptions],
  );

  useEffect(() => {
    if (selectedPartnerId == null) return;
    const stillPresent = allKnownPartnerOptions.some(
      (o) => o.value === String(selectedPartnerId),
    );
    if (!stillPresent) {
      setSelectedPartnerId(undefined);
    }
  }, [allKnownPartnerOptions, selectedPartnerId]);

  const selectedPartner = selectedPartnerId
    ? allKnownPartnerOptions.find((o) => o.value === String(selectedPartnerId))
    : undefined;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <StepIndicator
        step={2}
        totalSteps={3}
        backLabel="Volver al mapa"
        onBack={goToMap}
      />
      <div className="flex-1 px-4 py-4 md:py-6">
        <div className="mx-auto max-w-2xl">
          {/* Countdown banner */}
          <div className="flex flex-col items-end">
            <p
              className={cn(
                "text-xs text-amber-800",
                remainingSeconds <= 30
                  ? "text-destructive"
                  : "text-amber-800 dark:text-amber-200",
              )}
            >
              Te quedan
            </p>
            <div
              className={cn(
                "flex items-center gap-1",
                remainingSeconds <= 30
                  ? "text-destructive"
                  : "text-amber-800 dark:text-amber-200",
              )}
            >
              <TimerIcon className={`h-5 w-5`} />
              <span className={`text-xl font-bold font-sans tabular-nums`}>
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
                    {fullTable.isFullTable
                      ? "Espacios seleccionados"
                      : "Stand seleccionado"}
                  </p>
                  <p className="text-lg font-bold text-primary">
                    {fullTable.isFullTable
                      ? `Stands ${fullTable.standLabels.join(" y ")}`
                      : `Stand ${formatStandLabel(stand)}`}
                  </p>
                  {/* The price below is the table's, not a stand's, so the
                      card has to say which one is being bought. */}
                  {fullTable.isFullTable && (
                    <p className="text-sm text-muted-foreground">
                      Mesa completa · 240 × 60 cm
                    </p>
                  )}
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
                  selectedStandIds={
                    fullTable.standIds.length > 0
                      ? fullTable.standIds
                      : [stand.id]
                  }
                  mapBounds={mapBounds}
                />
              </div>
            </div>

            {/* Price */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">Total a pagar</p>
              <p className="text-lg font-bold">{formatPrice(payableAmount)}</p>
            </div>
            {sharesPrice && (
              <p className="mt-1 text-xs text-muted-foreground">
                Precio para dos participantes. Es el total de la reserva, no por
                persona, y lo paga quien reserva.
              </p>
            )}
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
              onSelectPartner={(id) => {
                setSelectedPartnerId(id);
                setConfirmError(null);
              }}
              selectedPartner={selectedPartner}
            />
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="sticky bottom-0 border-t bg-background px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {confirmError && (
          <Alert variant="destructive" className="mx-auto mb-3 max-w-lg">
            <AlertCircleIcon className="h-4 w-4" />
            <AlertDescription>
              {confirmError}{" "}
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto p-0"
                onClick={handleConfirm}
                disabled={isSubmitting || isExpired}
              >
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="mx-auto max-w-lg flex gap-3">
          <Button
            className="shrink"
            variant="ghost"
            onClick={() => setReleaseOpen(true)}
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

      <AlertDialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {fullTable.isFullTable
                ? `¿Liberar los stands ${fullTable.standLabels.join(" y ")}?`
                : `¿Liberar el stand ${formatStandLabel(stand)}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {fullTable.isFullTable
                ? "Otra persona podrá reservarlos."
                : "Otra persona podrá reservarlo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir con mi reserva</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                setReleaseOpen(false);
                handleCancel();
              }}
            >
              Liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
