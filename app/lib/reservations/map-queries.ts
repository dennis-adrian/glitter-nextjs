import "server-only";

import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import type {
  ParticipationType,
  UserCategory,
} from "@/app/api/users/definitions";
import { computeCanvasBounds } from "@/app/components/maps/map-utils";
import {
  type FestivalReservationConfirmationDto,
  type FestivalReservationMapDto,
  type ReservationMapElementDto,
} from "@/app/lib/reservations/dto";
import { buildFestivalReservationMapDto } from "@/app/lib/reservations/map-dto";
import { fetchFullTableOffer } from "@/app/lib/reservations/full-table-queries";
import { searchRecentPartners } from "@/app/lib/reservations/partner-search";
import {
  findActiveFullTableAccess,
  isFullTableCategory,
} from "@/app/lib/reservations/full-table-access";
import { profileCategoryForStandMatch } from "@/app/lib/reservations/policy";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { deriveEffectiveStandStatus } from "@/app/lib/stands/effective-status";
import { db } from "@/db";
import {
  externalParticipants,
  festivalSectors,
  festivals,
  mapElements,
  profileSubcategories,
  reservationExternalParticipants,
  reservationParticipants,
  standGroups,
  standHoldMembers,
  standHolds,
  standReservationStands,
  standReservations,
  standSubcategories,
  stands,
  userRequests,
  users,
} from "@/db/schema";

const MAP_ELEMENT_SELECT = {
  id: mapElements.id,
  type: mapElements.type,
  label: mapElements.label,
  labelPosition: mapElements.labelPosition,
  labelFontSize: mapElements.labelFontSize,
  labelFontWeight: mapElements.labelFontWeight,
  showIcon: mapElements.showIcon,
  positionLeft: mapElements.positionLeft,
  positionTop: mapElements.positionTop,
  width: mapElements.width,
  height: mapElements.height,
  rotation: mapElements.rotation,
} as const;

const CAPACITY_RESERVATION_STATUSES = [
  "pending",
  "verification_payment",
  "accepted",
] as const;

export async function fetchSelfServiceFestivalSnapshot(festivalId: number) {
  return db.query.festivals.findFirst({
    where: eq(festivals.id, festivalId),
    columns: {
      id: true,
      name: true,
      status: true,
      reservationsStartDate: true,
      participantTermsEnabled: true,
      reservationHoldMinutes: true,
      generalMapUrl: true,
    },
  });
}

export async function fetchSelfServiceTargetProfile(
  profileId: number,
  festivalId: number,
) {
  const profile = await db.query.users.findFirst({
    where: eq(users.id, profileId),
    // Category decides whether the full-table feature is offered at all.
    columns: { id: true, status: true, category: true },
  });
  if (!profile) return null;

  const enrollmentRows = await db
    .select({
      festivalId: userRequests.festivalId,
      type: userRequests.type,
      status: userRequests.status,
      termsVersionId: userRequests.termsVersionId,
    })
    .from(userRequests)
    .where(
      and(
        eq(userRequests.userId, profileId),
        eq(userRequests.festivalId, festivalId),
      ),
    );

  return { ...profile, userRequests: enrollmentRows };
}

export async function fetchFestivalReservationMapDto(input: {
  festivalId: number;
  profileId: number;
  revealHiddenIdentities: boolean;
  now?: Date;
}): Promise<FestivalReservationMapDto | null> {
  const now = input.now ?? new Date();

  const [festival, profile] = await Promise.all([
    fetchSelfServiceFestivalSnapshot(input.festivalId),
    db.query.users.findFirst({
      where: eq(users.id, input.profileId),
      columns: {
        id: true,
        displayName: true,
        category: true,
        participationType: true,
        imageUrl: true,
      },
    }),
  ]);
  if (!festival || !profile) return null;

  const standCategory = profileCategoryForStandMatch(profile.category);
  if (!standCategory) {
    return buildFestivalReservationMapDto({
      festival: {
        id: festival.id,
        name: festival.name,
        holdMinutes: festival.reservationHoldMinutes,
        generalMapUrl: festival.generalMapUrl,
      },
      profile,
      alreadyReserved: false,
      subcategoryIds: [],
      sectors: [],
      mapElementsBySectorId: new Map(),
      stands: [],
      subcategoryIdsByStandId: new Map(),
      activeHoldStandIds: new Set(),
      activeHold: null,
      reservationsByStandId: new Map(),
      revealHiddenIdentities: input.revealHiddenIdentities,
      fullTableGroupIds: new Set(),
      fullTableAccessActive: false,
      fullTableActivationPrice: null,
      now,
    });
  }

  const subcategoryRows = await db
    .select({ subcategoryId: profileSubcategories.subcategoryId })
    .from(profileSubcategories)
    .where(eq(profileSubcategories.profileId, profile.id));
  const subcategoryIds = subcategoryRows.map((row) => row.subcategoryId);

  const noRestrictions = notExists(
    db
      .select({ standId: standSubcategories.standId })
      .from(standSubcategories)
      .where(eq(standSubcategories.standId, stands.id)),
  );
  const subcategoryFilter =
    subcategoryIds.length > 0
      ? or(
          noRestrictions,
          exists(
            db
              .select({ standId: standSubcategories.standId })
              .from(standSubcategories)
              .where(
                and(
                  eq(standSubcategories.standId, stands.id),
                  inArray(standSubcategories.subcategoryId, subcategoryIds),
                ),
              ),
          ),
        )
      : noRestrictions;

  const standRows = await db
    .select({
      id: stands.id,
      festivalSectorId: stands.festivalSectorId,
      label: stands.label,
      standNumber: stands.standNumber,
      storedStatus: stands.status,
      positionLeft: stands.positionLeft,
      positionTop: stands.positionTop,
      width: stands.width,
      height: stands.height,
      standCategory: stands.standCategory,
      participationType: stands.participationType,
      price: stands.individualPrice,
      individualPrice: stands.individualPrice,
      sharedPrice: stands.sharedPrice,
      standGroupId: stands.standGroupId,
    })
    .from(stands)
    .where(
      and(
        eq(stands.festivalId, festival.id),
        eq(stands.standCategory, standCategory as UserCategory),
        eq(
          stands.participationType,
          profile.participationType as ParticipationType,
        ),
        subcategoryFilter,
      ),
    );

  const eligibleStands = standRows.filter(
    (row): row is typeof row & { festivalSectorId: number } =>
      row.festivalSectorId != null,
  );
  const standIds = eligibleStands.map((stand) => stand.id);
  const sectorIds = [
    ...new Set(eligibleStands.map((stand) => stand.festivalSectorId)),
  ];

  const [
    sectorRows,
    elementRows,
    restrictionRows,
    holdRows,
    activeHold,
    reservationParticipantRows,
    reservationExternalRows,
    alreadyReservedRow,
  ] = await Promise.all([
    sectorIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: festivalSectors.id,
            name: festivalSectors.name,
            description: festivalSectors.description,
            orderInFestival: festivalSectors.orderInFestival,
            mapOriginX: festivalSectors.mapOriginX,
            mapOriginY: festivalSectors.mapOriginY,
            mapWidth: festivalSectors.mapWidth,
            mapHeight: festivalSectors.mapHeight,
          })
          .from(festivalSectors)
          .where(inArray(festivalSectors.id, sectorIds)),
    sectorIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            ...MAP_ELEMENT_SELECT,
            festivalSectorId: mapElements.festivalSectorId,
          })
          .from(mapElements)
          .where(inArray(mapElements.festivalSectorId, sectorIds)),
    standIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            standId: standSubcategories.standId,
            subcategoryId: standSubcategories.subcategoryId,
          })
          .from(standSubcategories)
          .where(inArray(standSubcategories.standId, standIds)),
    standIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ standId: standHoldMembers.standId })
          .from(standHoldMembers)
          .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
          .where(
            and(
              inArray(standHoldMembers.standId, standIds),
              gt(standHolds.expiresAt, now),
            ),
          ),
    db.query.standHolds.findFirst({
      where: and(
        eq(standHolds.userId, profile.id),
        eq(standHolds.festivalId, festival.id),
        gt(standHolds.expiresAt, now),
      ),
      columns: { id: true, standId: true, expiresAt: true },
    }),
    standIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            reservationId: standReservations.id,
            standId: standReservationStands.standId,
            status: standReservations.status,
            revealAt: standReservations.revealAt,
            userId: users.id,
            displayName: users.displayName,
            imageUrl: users.imageUrl,
          })
          .from(standReservations)
          .innerJoin(
            standReservationStands,
            eq(standReservationStands.reservationId, standReservations.id),
          )
          .innerJoin(
            reservationParticipants,
            eq(reservationParticipants.reservationId, standReservations.id),
          )
          .innerJoin(users, eq(users.id, reservationParticipants.userId))
          .where(
            and(
              inArray(standReservationStands.standId, standIds),
              isNull(standReservationStands.releasedAt),
              inArray(standReservations.status, CAPACITY_RESERVATION_STATUSES),
            ),
          ),
    standIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            reservationId: standReservations.id,
            standId: standReservationStands.standId,
            status: standReservations.status,
            revealAt: standReservations.revealAt,
            externalId: externalParticipants.id,
            displayName: externalParticipants.displayName,
            imageUrl: externalParticipants.imageUrl,
          })
          .from(standReservations)
          .innerJoin(
            standReservationStands,
            eq(standReservationStands.reservationId, standReservations.id),
          )
          .innerJoin(
            reservationExternalParticipants,
            eq(
              reservationExternalParticipants.reservationId,
              standReservations.id,
            ),
          )
          .innerJoin(
            externalParticipants,
            eq(
              externalParticipants.id,
              reservationExternalParticipants.externalParticipantId,
            ),
          )
          .where(
            and(
              inArray(standReservationStands.standId, standIds),
              isNull(standReservationStands.releasedAt),
              inArray(standReservations.status, CAPACITY_RESERVATION_STATUSES),
            ),
          ),
    // Rejected and cancelled reservations still lock this person out of later
    // self-service; released reservations do not.
    db
      .select({ id: standReservations.id })
      .from(reservationParticipants)
      .innerJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .where(
        and(
          eq(reservationParticipants.userId, profile.id),
          eq(standReservations.festivalId, festival.id),
          inArray(standReservations.status, [
            ...CAPACITY_RESERVATION_STATUSES,
            "rejected",
            "cancelled",
          ]),
        ),
      )
      .limit(1),
  ]);

  const mapElementsBySectorId = new Map<number, ReservationMapElementDto[]>();
  for (const element of elementRows) {
    const { festivalSectorId, ...dto } = element;
    const list = mapElementsBySectorId.get(festivalSectorId) ?? [];
    list.push(dto);
    mapElementsBySectorId.set(festivalSectorId, list);
  }

  const subcategoryIdsByStandId = new Map<number, number[]>();
  for (const row of restrictionRows) {
    const list = subcategoryIdsByStandId.get(row.standId) ?? [];
    list.push(row.subcategoryId);
    subcategoryIdsByStandId.set(row.standId, list);
  }

  type ReservationBucket = {
    status: MapDtoReservationStatus;
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
  type MapDtoReservationStatus = NonNullable<
    FestivalReservationMapDto["sectors"][number]["stands"][number]["visibleParticipantSummaries"][number]["reservationStatus"]
  >;

  const reservationsByStandId = new Map<number, ReservationBucket[]>();
  const reservationIndex = new Map<number, ReservationBucket>();

  const bucketFor = (
    reservationId: number,
    standId: number,
    status: MapDtoReservationStatus,
    revealAt: Date | null,
  ) => {
    const bucket =
      reservationIndex.get(reservationId) ??
      ({
        status,
        revealAt,
        participants: [],
        externalParticipants: [],
      } satisfies ReservationBucket);
    reservationIndex.set(reservationId, bucket);
    // A full-table reservation covers more than one stand, so every member
    // stand has to resolve the same bucket or its half renders unoccupied.
    const list = reservationsByStandId.get(standId) ?? [];
    if (!list.includes(bucket)) {
      list.push(bucket);
      reservationsByStandId.set(standId, list);
    }
    return bucket;
  };

  for (const row of reservationParticipantRows) {
    const bucket = bucketFor(
      row.reservationId,
      row.standId,
      row.status,
      row.revealAt,
    );
    if (bucket.participants.some((p) => p.id === row.userId)) continue;
    bucket.participants.push({
      id: row.userId,
      displayName: row.displayName,
      imageUrl: row.imageUrl,
    });
  }
  for (const row of reservationExternalRows) {
    const bucket = bucketFor(
      row.reservationId,
      row.standId,
      row.status,
      row.revealAt,
    );
    if (bucket.externalParticipants.some((p) => p.id === row.externalId)) {
      continue;
    }
    bucket.externalParticipants.push({
      id: row.externalId,
      displayName: row.displayName,
      imageUrl: row.imageUrl,
    });
  }

  // Which of this festival's groups are declared full tables, and whether the
  // participant may act on that. Both feed the map's disclosure only: the
  // server rechecks availability at every capacity mutation.
  const fullTableGroupRows = await db
    .selectDistinct({ groupId: stands.standGroupId })
    .from(stands)
    .innerJoin(standGroups, eq(standGroups.id, stands.standGroupId))
    .where(
      and(
        eq(stands.festivalId, festival.id),
        eq(standGroups.type, "full_table"),
      ),
    );
  const fullTableGroupIds = new Set(
    fullTableGroupRows
      .map((row) => row.groupId)
      .filter((id): id is number => id != null),
  );
  const fullTableAccessActive = isFullTableCategory(profile.category)
    ? (await db.transaction((tx) =>
        findActiveFullTableAccess(tx, {
          userId: profile.id,
          festivalId: festival.id,
        }),
      )) != null
    : false;

  // Only for somebody who could activate on the spot. Anyone short of the fee
  // is deliberately left out: sending them to buy from inside the map is the
  // financial setup §7.2 keeps out of it, and the panel already handles them.
  const activationOffer =
    !fullTableAccessActive && isFullTableCategory(profile.category)
      ? await fetchFullTableOffer({
          userId: profile.id,
          festivalId: festival.id,
          category: profile.category,
        })
      : null;
  const fullTableActivationPrice =
    activationOffer?.offered &&
    !activationOffer.active &&
    activationOffer.shortfall === 0
      ? activationOffer.creditPrice
      : null;

  return buildFestivalReservationMapDto({
    festival: {
      id: festival.id,
      name: festival.name,
      holdMinutes: festival.reservationHoldMinutes,
      generalMapUrl: festival.generalMapUrl,
    },
    profile,
    alreadyReserved: alreadyReservedRow.length > 0,
    subcategoryIds,
    sectors: sectorRows,
    mapElementsBySectorId,
    stands: eligibleStands,
    subcategoryIdsByStandId,
    activeHoldStandIds: new Set(holdRows.map((hold) => hold.standId)),
    activeHold: activeHold
      ? {
          ...activeHold,
          // Both halves of a full table, so the participant's own companion
          // does not render as someone else's held stand.
          standIds: (
            await db
              .select({ standId: standHoldMembers.standId })
              .from(standHoldMembers)
              .where(eq(standHoldMembers.holdId, activeHold.id))
          ).map((row) => row.standId),
        }
      : null,
    reservationsByStandId,
    revealHiddenIdentities: input.revealHiddenIdentities,
    fullTableGroupIds,
    fullTableAccessActive,
    fullTableActivationPrice,
    now,
  });
}

export async function fetchFestivalReservationConfirmationDto(input: {
  festivalId: number;
  profileId: number;
  holdId: number;
  now?: Date;
}): Promise<FestivalReservationConfirmationDto | null> {
  const now = input.now ?? new Date();

  const hold = await db.query.standHolds.findFirst({
    where: and(
      eq(standHolds.id, input.holdId),
      eq(standHolds.userId, input.profileId),
      eq(standHolds.festivalId, input.festivalId),
    ),
    columns: {
      id: true,
      standId: true,
      expiresAt: true,
      festivalId: true,
      individualPriceSnapshot: true,
      sharedPriceSnapshot: true,
      fullTablePriceSnapshot: true,
    },
  });
  if (!hold || hold.expiresAt <= now) return null;

  const [stand, festival, profile] = await Promise.all([
    db.query.stands.findFirst({
      where: eq(stands.id, hold.standId),
      columns: {
        id: true,
        label: true,
        standNumber: true,
        standCategory: true,
        individualPrice: true,
        sharedPrice: true,
        festivalSectorId: true,
      },
    }),
    db.query.festivals.findFirst({
      where: eq(festivals.id, input.festivalId),
      columns: { id: true, name: true },
    }),
    db.query.users.findFirst({
      where: eq(users.id, input.profileId),
      columns: {
        id: true,
        displayName: true,
        category: true,
        imageUrl: true,
      },
    }),
  ]);

  if (!stand || !festival || !profile) return null;
  if (stand.festivalSectorId == null) return null;

  const sector = await db.query.festivalSectors.findFirst({
    where: eq(festivalSectors.id, stand.festivalSectorId),
    columns: {
      id: true,
      name: true,
      mapOriginX: true,
      mapOriginY: true,
      mapWidth: true,
      mapHeight: true,
    },
  });
  if (!sector) return null;

  const thumbnailRows = await db
    .select({
      id: stands.id,
      storedStatus: stands.status,
      positionLeft: stands.positionLeft,
      positionTop: stands.positionTop,
      label: stands.label,
      standNumber: stands.standNumber,
    })
    .from(stands)
    .where(eq(stands.festivalSectorId, stand.festivalSectorId));

  const thumbnailIds = thumbnailRows.map((row) => row.id);
  const activeHoldRows =
    thumbnailIds.length === 0
      ? []
      : await db
          .select({ standId: standHoldMembers.standId })
          .from(standHoldMembers)
          .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
          .where(
            and(
              inArray(standHoldMembers.standId, thumbnailIds),
              gt(standHolds.expiresAt, now),
            ),
          );
  const activeHoldStandIds = new Set(activeHoldRows.map((row) => row.standId));
  const thumbnailStands = thumbnailRows.map((row) => ({
    id: row.id,
    status: deriveEffectiveStandStatus(
      row.storedStatus,
      row.id,
      activeHoldStandIds,
    ),
    positionLeft: row.positionLeft,
    positionTop: row.positionTop,
    label: row.label,
    standNumber: row.standNumber,
  }));

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
      : computeCanvasBounds(thumbnailStands);

  const recentPartners = await searchRecentPartners(festival.id);

  // Membership decides what this hold really covers; the adapter column only
  // names the half the participant picked first.
  const holdMembers = await db
    .select({
      standId: standHoldMembers.standId,
      label: stands.label,
      standNumber: stands.standNumber,
    })
    .from(standHoldMembers)
    .innerJoin(stands, eq(stands.id, standHoldMembers.standId))
    .where(eq(standHoldMembers.holdId, hold.id))
    .orderBy(asc(standHoldMembers.position));

  const isFullTable = holdMembers.length > 1;
  const access = isFullTable
    ? null
    : await db.transaction((tx) =>
        findActiveFullTableAccess(tx, {
          userId: input.profileId,
          festivalId: input.festivalId,
        }),
      );

  return {
    fullTable: {
      isFullTable,
      isHalfTableFallback: !isFullTable && access != null,
      standLabels: holdMembers.map((member) =>
        formatStandLabel({
          label: member.label,
          standNumber: member.standNumber,
        }),
      ),
      // Both halves, so the summary can highlight what is actually held
      // rather than only the one the participant clicked.
      standIds: holdMembers.map((member) => member.standId),
    },
    festival,
    profile,
    hold: { id: hold.id, expiresAt: hold.expiresAt.toISOString() },
    stand: {
      id: stand.id,
      label: stand.label,
      standNumber: stand.standNumber,
      standCategory: stand.standCategory,
      // The hold already snapshotted the prices this participant will be
      // billed; the stand columns are only a fallback for holds taken before
      // snapshots existed. A whole table is billed at the table's own price,
      // replacing its halves', so that is what the screen has to quote.
      price:
        isFullTable && hold.fullTablePriceSnapshot != null
          ? hold.fullTablePriceSnapshot
          : (hold.individualPriceSnapshot ?? stand.individualPrice),
      // Confirmation bills the shared price once a partner is added, so the
      // screen has to be able to show that instead — except on a full table,
      // where adding a partner does not change what the table costs.
      sharedPrice: isFullTable
        ? null
        : (hold.sharedPriceSnapshot ?? stand.sharedPrice),
    },
    sector: {
      id: sector.id,
      name: sector.name,
      mapBounds,
      thumbnailStands,
    },
    recentPartners,
  };
}
