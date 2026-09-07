"use client";

import { ArrowRight, Maximize2Icon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ReservationActiveHoldDto,
  ReservationMapFestivalDto,
  ReservationMapProfileDto,
  ReservationMapStandDto,
} from "@/app/lib/reservations/dto";
import CategoryBadge from "@/app/components/category-badge";
import FullTableSelectionNotice from "@/app/components/festivals/reservations/full-table-selection-notice";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { activateFullTableAccessAction } from "@/app/lib/reservations/full-table-actions";
import HalfTableFallbackDialog from "@/app/components/festivals/reservations/half-table-fallback-dialog";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { resolveFullTableSelection } from "@/app/lib/reservations/full-table-selection";
import { createStandHold } from "@/app/lib/stands/hold-actions";
import { canStandBeReserved } from "@/app/lib/stands/helpers";
import { formatStandsLabel } from "@/app/lib/stands/groups";
import {
  nextHoldIntent,
  type HoldIntentCache,
} from "@/app/lib/stands/hold-intent";
import { toast } from "sonner";

type ActiveHold =
  | ReservationActiveHoldDto
  | { id: number; standId: number; standIds?: number[] }
  | null;

/**
 * Whether this stand is part of the viewer's own hold.
 *
 * A full table is held as two stands, and only one of them is named by the
 * hold's adapter column — matching on that alone made the participant's own
 * companion half look like someone else's.
 */
function heldByViewer(standId: number, hold: ActiveHold): boolean {
  if (!hold) return false;
  const held = "standIds" in hold && hold.standIds ? hold.standIds : [];
  return hold.standId === standId || held.includes(standId);
}

type StandInfoCardProps = {
  stand: ReservationMapStandDto;
  sectorName: string;
  groupStands?: ReservationMapStandDto[];
  profile: ReservationMapProfileDto;
  festival: ReservationMapFestivalDto;
  alreadyReserved: boolean;
  subcategoryIds: number[];
  activeHold?: ActiveHold;
  /** Every stand the viewer can see in this sector; the companion lives here. */
  sectorStands?: ReservationMapStandDto[];
  /** Whether the viewer activated full-table access for this festival. */
  fullTableAccessActive?: boolean;
  /** Set when the viewer could activate full-table access without buying. */
  fullTableActivationPrice?: number | null;
  onHoldChange?: (hold: ActiveHold) => void;
  onClose: () => void;
  isPending: boolean;
  startTransition: (callback: () => void | Promise<void>) => void;
};

function getStandDimensions(
  standCategory: ReservationMapStandDto["standCategory"],
): string {
  if (standCategory === "gastronomy") return "140cm x 70cm";
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
  stand: ReservationMapStandDto,
  profile: ReservationMapProfileDto,
  alreadyReserved: boolean,
  subcategoryIds: number[],
  activeHold?: ActiveHold,
): string | null {
  if (stand.effectiveStatus === "disabled") return "Espacio deshabilitado";
  if (
    stand.effectiveStatus === "held" &&
    !heldByViewer(stand.id, activeHold ?? null)
  )
    return "Espacio en espera por otro participante";
  if (
    profile.category !== stand.standCategory &&
    profile.category !== "new_artist"
  )
    return "No podés reservar en este espacio";
  if (
    profile.category === "new_artist" &&
    stand.standCategory !== "illustration"
  )
    return "No podés reservar en este espacio";
  if (stand.eligibleSubcategoryIds.length > 0) {
    const hasMatch = subcategoryIds.some((id) =>
      stand.eligibleSubcategoryIds.includes(id),
    );
    if (!hasMatch) return "No podés reservar en este espacio";
  }
  if (alreadyReserved) return "Ya tenés una reserva en este festival";
  return null;
}

export function StandInfoCard({
  stand,
  sectorName,
  groupStands,
  profile,
  festival,
  alreadyReserved,
  subcategoryIds,
  activeHold,
  sectorStands,
  fullTableAccessActive = false,
  fullTableActivationPrice = null,
  onHoldChange,
  onClose,
  isPending,
  startTransition,
}: StandInfoCardProps) {
  const router = useRouter();
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const isOwnHold =
    stand.effectiveStatus === "held" &&
    heldByViewer(stand.id, activeHold ?? null);

  const isStandTaken =
    stand.effectiveStatus === "reserved" ||
    stand.effectiveStatus === "confirmed" ||
    (stand.effectiveStatus === "held" && !isOwnHold);

  const canReserve =
    !isStandTaken &&
    !isOwnHold &&
    canStandBeReserved(stand, profile, subcategoryIds) &&
    !alreadyReserved;

  const eligibilityMessage = getEligibilityMessage(
    stand,
    profile,
    alreadyReserved,
    subcategoryIds,
    activeHold,
  );
  const standReservationSummaries = stand.visibleParticipantSummaries;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("es-BO", {
      style: "currency",
      currency: "BOB",
      minimumFractionDigits: 0,
    }).format(price);

  const dimensions = getStandDimensions(stand.standCategory);
  const cardStands = groupStands?.length ? groupStands : [stand];
  const fullTableSelection = resolveFullTableSelection({
    stand,
    sectorStands: sectorStands ?? groupStands ?? [stand],
    accessActive: fullTableAccessActive,
    activationPrice: fullTableActivationPrice,
  });
  const holdMinutes = festival.holdMinutes;
  const holdIntentKeyRef = useRef<HoldIntentCache | null>(null);
  const prevActiveHoldRef = useRef(activeHold);

  useEffect(() => {
    const prev = prevActiveHoldRef.current;
    const cached = holdIntentKeyRef.current;
    if (prev && !activeHold && cached?.standId === prev.standId) {
      holdIntentKeyRef.current = {
        ...cached,
        expiresAt: 0,
      };
    }
    prevActiveHoldRef.current = activeHold;
  }, [activeHold]);

  const idempotencyKeyForStand = (standId: number) => {
    const next = nextHoldIntent(
      holdIntentKeyRef.current,
      standId,
      Date.now(),
      holdMinutes * 60 * 1000,
      () => crypto.randomUUID(),
    );
    holdIntentKeyRef.current = next;
    return next.key;
  };

  /**
   * Taking a stand claims capacity immediately, so a participant who paid for
   * a full table has to acknowledge the half-table fallback before that
   * happens rather than discover it afterwards (PRD §7.4).
   */
  const handleSelectStand = () => {
    if (!canReserve || isPending) return;
    if (fullTableSelection.kind === "fallback") {
      setFallbackOpen(true);
      return;
    }
    // With access active the pair is the default, so an unqualified selection
    // is the whole table. The half is reachable through its own button.
    takeStand();
  };

  /** The single half, for somebody who could have taken the pair. */
  const handleSelectHalf = () => takeStand({ singleStandOnly: true });

  /**
   * Activate, then take the pair.
   *
   * Two server calls rather than one because activation is its own audited,
   * idempotent command and stays that way; the hold that follows sees the
   * access it just created. If activation fails nothing is taken, so a
   * participant cannot end up holding a table they never paid the fee for.
   */
  const handleActivateAndSelect = () => {
    if (!canReserve || isPending) return;
    startTransition(async () => {
      try {
        const activated = await activateFullTableAccessAction({
          festivalId: festival.id,
          idempotencyKey: crypto.randomUUID(),
        });
        if (!activated.success) {
          toast.error(activated.message);
          return;
        }
      } catch (error) {
        console.error("Error activating full table", error);
        toast.error("No se pudo activar la mesa completa.");
        return;
      }
      takeStand();
    });
  };

  /**
   * Takes the stand. `singleStandOnly` is how a participant who holds — or is
   * about to hold — full-table access says they want this half on its own;
   * without it the server hands them the pair, which is the default the
   * feature was bought for.
   */
  const takeStand = (options?: { singleStandOnly?: boolean }) => {
    if (!canReserve || isPending) return;
    setFallbackOpen(false);
    startTransition(async () => {
      try {
        const idempotencyKey = idempotencyKeyForStand(stand.id);
        const res = await createStandHold({
          standId: stand.id,
          idempotencyKey,
          ...(options?.singleStandOnly ? { singleStandOnly: true } : {}),
        });
        if (res.success && res.data.holdId) {
          const cached = holdIntentKeyRef.current;
          if (cached?.standId === stand.id) {
            cached.expiresAt = Date.now() + holdMinutes * 60 * 1000;
          }
        }
        if (res.success && res.data.reservationId) {
          toast.success(res.message);
          onClose();
          router.replace(
            `/profiles/${profile.id}/festivals/${festival.id}/reservations/${res.data.reservationId}/payments`,
          );
          return;
        }
        if (res.success && res.data.holdId) {
          onHoldChange?.({ id: res.data.holdId, standId: stand.id });
          onClose();
          router.replace(
            `/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${stand.festivalSectorId}/confirm/${res.data.holdId}`,
          );
        } else {
          toast.error(res.message);
        }
      } catch {
        toast.error("No se pudo seleccionar el espacio");
      }
    });
  };

  const handleContinueToHold = () => {
    if (!activeHold || isPending) return;
    startTransition(() => {
      onClose();
      router.replace(
        `/profiles/${profile.id}/festivals/${festival.id}/reservations/new/sectors/${stand.festivalSectorId}/confirm/${activeHold.id}`,
      );
    });
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up-fast md:bottom-6 md:left-auto md:right-6 md:w-100">
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
                      stand.effectiveStatus === "held"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {stand.effectiveStatus === "held" ? "EN ESPERA" : "OCUPADO"}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <h4 className="text-xl font-bold">
                  {cardStands.length > 1 ? "Stands" : "Stand"}{" "}
                  {formatStandsLabel(cardStands)}
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
                {/* The shared price is the total for the whole reservation,
                    owner-paid — stating it here keeps the map honest about
                    what confirming with a partner will actually cost. */}
                {stand.sharedPrice != null && (
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(stand.sharedPrice)} compartido
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline">
              <Maximize2Icon className="h-3 w-3 mr-2 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-normal">
                {dimensions}
              </span>
            </Badge>
          </div>

          {isOwnHold && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                Tenés este espacio reservado temporalmente. Confirmá tu reserva
                antes de que expire.
              </p>
            </div>
          )}

          {stand.effectiveStatus === "held" && !isOwnHold && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                Otro participante está considerando este espacio. Volverá a
                estar disponible en breve.
              </p>
            </div>
          )}

          {isStandTaken &&
            stand.effectiveStatus !== "held" &&
            standReservationSummaries.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4">
                <div className="mb-3 space-y-2">
                  {standReservationSummaries.map((participant) => (
                    <div
                      key={`${participant.kind}-${participant.id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar className="h-12 w-12 border-red-200">
                        <AvatarImage
                          src={participant.imageUrl ?? undefined}
                          alt={participant.displayName || "Participante"}
                        />
                      </Avatar>
                      <div className="flex-1">
                        <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-red-600">
                          Reservado por
                        </p>
                        <p className="text-base font-bold text-gray-900">
                          {participant.displayName || "Participante"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Estado:</span>
                    <span className="font-semibold text-gray-900">
                      {getReservationStatusLabel(
                        standReservationSummaries[0]?.reservationStatus ?? "",
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

          {!canReserve &&
            !isStandTaken &&
            eligibilityMessage &&
            !alreadyReserved && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">{eligibilityMessage}</p>
              </div>
            )}

          {alreadyReserved && !isStandTaken && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-blue-800">
                Ya tenés una reserva en este festival
              </p>
            </div>
          )}

          {canReserve && (
            <FullTableSelectionNotice selection={fullTableSelection} />
          )}

          {isOwnHold ? (
            <Button
              type="button"
              onClick={handleContinueToHold}
              disabled={isPending}
            >
              <span>Continuar con tu reserva</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : canReserve &&
            (fullTableSelection.kind === "full" ||
              fullTableSelection.kind === "offer") ? (
            /* Two ways to take a whole table's half, so neither is a guess.
               Always stacked, never side by side: the card is a fixed width at
               every breakpoint and "Activar y seleccionar mesa completa" alone
               overflows it on one line. Column-reverse puts the table — what
               the fee buys — on top, with the plain stand under it. */
            <div className="flex flex-col-reverse gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleSelectHalf}
                disabled={isPending}
              >
                <span>Seleccionar stand</span>
              </Button>
              <Button
                type="button"
                className="w-full"
                onClick={
                  fullTableSelection.kind === "offer"
                    ? handleActivateAndSelect
                    : handleSelectStand
                }
                disabled={isPending}
              >
                <span>
                  {fullTableSelection.kind === "offer"
                    ? `Activar y seleccionar mesa completa (${formatCreditCount(
                        fullTableSelection.creditPrice,
                      )})`
                    : "Seleccionar mesa completa"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : canReserve ? (
            <Button
              type="button"
              onClick={handleSelectStand}
              disabled={isPending}
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

      {fullTableSelection.kind === "fallback" ? (
        <HalfTableFallbackDialog
          open={fallbackOpen}
          stand={stand}
          companion={fullTableSelection.companion}
          onCancel={() => setFallbackOpen(false)}
          onConfirm={takeStand}
          isPending={isPending}
        />
      ) : null}
    </div>
  );
}
