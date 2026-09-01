import type {
  ParticipationType,
  UserCategory,
} from "@/app/api/users/definitions";
import type {
  MapElementLabelPosition,
  MapElementType,
} from "@/app/lib/map_elements/definitions";
import type { ReservationErrorCode } from "@/app/lib/reservations/errors";
import type { standReservations, stands } from "@/db/schema";

export type PublicProfileSummaryDto = {
  id: number;
  displayName: string | null;
  imageUrl: string | null;
  bio: string | null;
  userSocials: Array<{
    id: number;
    type: "instagram" | "facebook" | "twitter" | "tiktok" | "youtube";
    username: string;
  }>;
};

export type PartnerSearchResultDto = {
  id: number;
  displayName: string | null;
  imageUrl: string | null;
  selectable: boolean;
  denialCode?: ReservationErrorCode;
};

export type ReservationStandRefDto = {
  id: number;
  stand: {
    id: number;
    label: string | null;
    standNumber: number;
  };
  participants: Array<{ userId: number }>;
};

export const PUBLIC_USER_COLUMNS = {
  id: true,
  displayName: true,
  imageUrl: true,
  bio: true,
} as const;

export type StandStatus = (typeof stands.$inferSelect)["status"];
export type ReservationStatus =
  (typeof standReservations.$inferSelect)["status"];

export type ReservationMapBoundsDto = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type ReservationMapElementDto = {
  id: number;
  type: MapElementType;
  label: string | null;
  labelPosition: MapElementLabelPosition;
  labelFontSize: number;
  labelFontWeight: number;
  showIcon: boolean;
  positionLeft: number;
  positionTop: number;
  width: number;
  height: number;
  rotation: number;
};

export type VisibleParticipantSummaryDto = {
  id: number;
  displayName: string | null;
  imageUrl: string | null;
  reservationStatus: ReservationStatus;
  kind: "user" | "external";
};

export type ReservationMapStandDto = {
  id: number;
  label: string | null;
  standNumber: number;
  /** Effective availability after expired-hold reconciliation. */
  effectiveStatus: StandStatus;
  /** Alias of `effectiveStatus` for map renderers that read `status`. */
  status: StandStatus;
  positionLeft: number | null;
  positionTop: number | null;
  width: number | null;
  height: number | null;
  standCategory: UserCategory;
  participationType: ParticipationType;
  price: number;
  eligibleSubcategoryIds: number[];
  festivalSectorId: number;
  standGroupId: number | null;
  occupantKey: string | null;
  hasExternalOccupant: boolean;
  visibleParticipantSummaries: VisibleParticipantSummaryDto[];
};

export type ReservationMapProfileDto = {
  id: number;
  displayName: string | null;
  category: UserCategory;
  participationType: ParticipationType;
  imageUrl: string | null;
};

export type ReservationMapFestivalDto = {
  id: number;
  name: string;
  holdMinutes: number;
  generalMapUrl: string | null;
};

export type ReservationMapSectorDto = {
  id: number;
  name: string;
  description: string | null;
  order: number;
  mapBounds: ReservationMapBoundsDto | null;
  mapElements: ReservationMapElementDto[];
  stands: ReservationMapStandDto[];
  availableCount: number;
  price: number;
};

export type ReservationActiveHoldDto = {
  id: number;
  standId: number;
  expiresAt: string;
};

export type FestivalReservationMapDto = {
  festival: ReservationMapFestivalDto;
  profile: ReservationMapProfileDto;
  alreadyReserved: boolean;
  subcategoryIds: number[];
  sectors: ReservationMapSectorDto[];
  activeHold: ReservationActiveHoldDto | null;
};

export type ReservationConfirmationStandDto = {
  id: number;
  label: string | null;
  standNumber: number;
  standCategory: UserCategory;
  price: number;
};

export type ReservationConfirmationThumbnailStandDto = {
  id: number;
  status: StandStatus;
  positionLeft: number | null;
  positionTop: number | null;
  label: string | null;
  standNumber: number;
};

export type FestivalReservationConfirmationDto = {
  festival: { id: number; name: string };
  profile: {
    id: number;
    displayName: string | null;
    category: UserCategory;
    imageUrl: string | null;
  };
  hold: { id: number; expiresAt: string };
  stand: ReservationConfirmationStandDto;
  sector: {
    id: number;
    name: string;
    mapBounds: ReservationMapBoundsDto;
    thumbnailStands: ReservationConfirmationThumbnailStandDto[];
  };
  recentPartners: PartnerSearchResultDto[];
};

export const MAP_DTO_FORBIDDEN_KEYS = [
  "email",
  "phoneNumber",
  "clerkId",
  "birthdate",
  "firstName",
  "lastName",
  "gender",
  "userRequests",
  "participations",
  "infractions",
  "voucherUrl",
] as const;

export function collectForbiddenDtoKeys(
  value: unknown,
  keys: readonly string[] = MAP_DTO_FORBIDDEN_KEYS,
): string[] {
  const forbidden = new Set(keys);
  const found = new Set<string>();

  const walk = (node: unknown) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (forbidden.has(key)) found.add(key);
      walk(child);
    }
  };

  walk(value);
  return [...found].sort();
}
