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
  /**
   * True when this stand is one half of an admin-declared full table. The
   * companion is the other stand sharing `standGroupId`; pairing is never
   * inferred from position (PRD §7.1).
   */
  isFullTableHalf: boolean;
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
  /** The half the participant picked first. Use `standIds` for what is held. */
  standId: number;
  /** Every stand this hold covers; two for a full table. */
  standIds: number[];
  expiresAt: string;
};

export type FestivalReservationMapDto = {
  festival: ReservationMapFestivalDto;
  profile: ReservationMapProfileDto;
  alreadyReserved: boolean;
  subcategoryIds: number[];
  sectors: ReservationMapSectorDto[];
  activeHold: ReservationActiveHoldDto | null;
  /**
   * Whether this participant activated full-table access for the festival.
   * The map only reads it to say what a selection will produce — the server
   * decides what is actually claimed (PRD §7.4: UI availability is
   * informational).
   */
  fullTableAccessActive: boolean;
};

export type ReservationConfirmationStandDto = {
  id: number;
  label: string | null;
  standNumber: number;
  standCategory: UserCategory;
  /** Billed when the participant books alone. */
  price: number;
  /**
   * Billed instead when a partner is confirmed — the total for the pair, not
   * per person. Null where the stand has no shared price configured.
   */
  sharedPrice: number | null;
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
  /**
   * What this hold actually covers. The half-table fallback has to be stated
   * explicitly wherever a participant can still commit (PRD §7.4), so the
   * summary screen needs to know both what was taken and what was hoped for.
   */
  fullTable: {
    /** The hold covers both halves of a declared pair. */
    isFullTable: boolean;
    /** Access is active but only one half was available. */
    isHalfTableFallback: boolean;
    /** Labels of every stand in the hold, in selection order. */
    standLabels: string[];
  };
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
