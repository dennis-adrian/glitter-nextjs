import { isReservationHidden } from "@/app/lib/reservations/reveal";
import { occupiesStandCapacity } from "@/app/lib/reservations/policy";
import { deriveEffectiveStandStatus } from "@/app/lib/stands/effective-status";
import type {
  FestivalReservationMapDto,
  ReservationMapElementDto,
  ReservationMapSectorDto,
  ReservationMapStandDto,
  ReservationStatus,
  StandStatus,
  VisibleParticipantSummaryDto,
} from "@/app/lib/reservations/dto";
import type {
  ParticipationType,
  UserCategory,
} from "@/app/api/users/definitions";

export type MapDtoStandRow = {
  id: number;
  festivalSectorId: number;
  label: string | null;
  standNumber: number;
  storedStatus: StandStatus;
  positionLeft: number | null;
  positionTop: number | null;
  width: number | null;
  height: number | null;
  standCategory: UserCategory;
  participationType: ParticipationType;
  price: number;
  standGroupId: number | null;
};

export type MapDtoReservationRow = {
  standId: number;
  status: ReservationStatus;
  revealAt: Date | null;
  participants: Array<{
    id: number;
    displayName: string | null;
    imageUrl: string | null;
  }>;
  externalParticipants: Array<{
    id: number;
    displayName: string | null;
    imageUrl: string | null;
  }>;
};

export type MapDtoSectorRow = {
  id: number;
  name: string;
  description: string | null;
  orderInFestival: number;
  mapOriginX: number | null;
  mapOriginY: number | null;
  mapWidth: number | null;
  mapHeight: number | null;
};

export type MapDtoBuildInput = {
  festival: {
    id: number;
    name: string;
    holdMinutes: number;
    generalMapUrl: string | null;
  };
  profile: {
    id: number;
    displayName: string | null;
    category: UserCategory;
    participationType: ParticipationType;
    imageUrl: string | null;
  };
  alreadyReserved: boolean;
  subcategoryIds: number[];
  sectors: MapDtoSectorRow[];
  mapElementsBySectorId: Map<number, ReservationMapElementDto[]>;
  stands: MapDtoStandRow[];
  subcategoryIdsByStandId: Map<number, number[]>;
  activeHoldStandIds: ReadonlySet<number>;
  activeHold: { id: number; standId: number; expiresAt: Date } | null;
  reservationsByStandId: Map<number, MapDtoReservationRow[]>;
  revealHiddenIdentities: boolean;
  now: Date;
};

function occupantKeyFromSummaries(
  summaries: VisibleParticipantSummaryDto[],
): string | null {
  if (summaries.length === 0) return null;
  return [...new Set(summaries.map((row) => `${row.kind}-${row.id}`))]
    .sort()
    .join("|");
}

function visibleSummariesForStand(
  reservations: MapDtoReservationRow[] | undefined,
  revealHiddenIdentities: boolean,
  now: Date,
): VisibleParticipantSummaryDto[] {
  if (!reservations?.length) return [];
  const summaries: VisibleParticipantSummaryDto[] = [];
  for (const reservation of reservations) {
    if (!occupiesStandCapacity(reservation.status)) continue;
    if (
      !revealHiddenIdentities &&
      isReservationHidden({ revealAt: reservation.revealAt }, now)
    ) {
      continue;
    }
    for (const participant of reservation.participants) {
      summaries.push({
        id: participant.id,
        displayName: participant.displayName,
        imageUrl: participant.imageUrl,
        reservationStatus: reservation.status,
        kind: "user",
      });
    }
    for (const participant of reservation.externalParticipants) {
      summaries.push({
        id: participant.id,
        displayName: participant.displayName,
        imageUrl: participant.imageUrl,
        reservationStatus: reservation.status,
        kind: "external",
      });
    }
  }
  return summaries;
}

export function toReservationMapStandDto(
  stand: MapDtoStandRow,
  input: Pick<
    MapDtoBuildInput,
    | "subcategoryIdsByStandId"
    | "activeHoldStandIds"
    | "reservationsByStandId"
    | "revealHiddenIdentities"
    | "now"
  >,
): ReservationMapStandDto {
  const effectiveStatus = deriveEffectiveStandStatus(
    stand.storedStatus,
    stand.id,
    input.activeHoldStandIds,
  );
  const summaries = visibleSummariesForStand(
    input.reservationsByStandId.get(stand.id),
    input.revealHiddenIdentities,
    input.now,
  );
  return {
    id: stand.id,
    label: stand.label,
    standNumber: stand.standNumber,
    effectiveStatus,
    status: effectiveStatus,
    positionLeft: stand.positionLeft,
    positionTop: stand.positionTop,
    width: stand.width,
    height: stand.height,
    standCategory: stand.standCategory,
    participationType: stand.participationType,
    price: stand.price,
    eligibleSubcategoryIds: input.subcategoryIdsByStandId.get(stand.id) ?? [],
    festivalSectorId: stand.festivalSectorId,
    standGroupId: stand.standGroupId,
    occupantKey: occupantKeyFromSummaries(summaries),
    hasExternalOccupant: summaries.some((row) => row.kind === "external"),
    visibleParticipantSummaries: summaries,
  };
}

export function buildFestivalReservationMapDto(
  input: MapDtoBuildInput,
): FestivalReservationMapDto {
  const standsBySectorId = new Map<number, ReservationMapStandDto[]>();
  for (const stand of input.stands) {
    const dto = toReservationMapStandDto(stand, input);
    const list = standsBySectorId.get(stand.festivalSectorId) ?? [];
    list.push(dto);
    standsBySectorId.set(stand.festivalSectorId, list);
  }

  const sectors: ReservationMapSectorDto[] = [...input.sectors]
    .sort((a, b) => a.orderInFestival - b.orderInFestival)
    .map((sector) => {
      const stands = standsBySectorId.get(sector.id) ?? [];
      const mapBounds =
        sector.mapOriginX != null &&
        sector.mapOriginY != null &&
        sector.mapWidth != null &&
        sector.mapHeight != null
          ? {
              minX: sector.mapOriginX,
              minY: sector.mapOriginY,
              width: sector.mapWidth,
              height: sector.mapHeight,
            }
          : null;
      return {
        id: sector.id,
        name: sector.name,
        description: sector.description,
        order: sector.orderInFestival,
        mapBounds,
        mapElements: input.mapElementsBySectorId.get(sector.id) ?? [],
        stands,
        availableCount: stands.filter(
          (stand) => stand.effectiveStatus === "available",
        ).length,
        price: stands[0]?.price ?? 0,
      };
    })
    .filter((sector) => sector.stands.length > 0);

  return {
    festival: input.festival,
    profile: input.profile,
    alreadyReserved: input.alreadyReserved,
    subcategoryIds: input.subcategoryIds,
    sectors,
    activeHold: input.activeHold
      ? {
          id: input.activeHold.id,
          standId: input.activeHold.standId,
          expiresAt: input.activeHold.expiresAt.toISOString(),
        }
      : null,
  };
}
