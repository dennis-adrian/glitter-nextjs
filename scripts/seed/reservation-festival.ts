import { and, eq, gt, sql } from "drizzle-orm";

import { ensureDefaultFestivalTerms } from "@/app/lib/festival-terms/persist";
import type { db as DbType } from "@/db";
import {
  festivalDates,
  festivalSectors,
  festivals,
  mapElements,
  reservationParticipants,
  standGroups,
  standHolds,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";

import type { SeedDemoUsersResult } from "./demo-users";
import {
  DEMO_FESTIVAL_NAME,
  DEMO_SECTORS,
  ENROLLED_DEMO_USER_KEYS,
  LOCAL_SEED_USERS,
  STANDS_PER_SECTOR,
  STAND_SIZE,
  seedStandPosition,
  seedStandRole,
  seedStandStoredStatus,
  sectorMapBounds,
  type LocalSeedUser,
  type SeedSectorPlan,
  type SeedStandRole,
} from "./reservation-festival-plan";

export type SeedReservationFestivalResult = {
  festivalId: number;
  created: boolean;
  sectorIds: number[];
  standCount: number;
};

type Database = typeof DbType;

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function upsertLocalSeedUser(database: Database, demo: LocalSeedUser) {
  const sharedFields = {
    email: demo.email,
    displayName: demo.displayName,
    firstName: demo.firstName,
    lastName: demo.lastName,
    phoneNumber: demo.phoneNumber,
    role: "user" as const,
    status: "verified" as const,
    category: demo.category,
    participationType: "standard" as const,
    verifiedAt: new Date(),
    updatedAt: new Date(),
  };

  const existingByClerk = await database.query.users.findFirst({
    where: eq(users.clerkId, demo.clerkId),
    columns: { id: true },
  });
  if (existingByClerk) {
    const [row] = await database
      .update(users)
      .set(sharedFields)
      .where(eq(users.clerkId, demo.clerkId))
      .returning({ id: users.id });
    return row;
  }

  const existingByEmail = await database.query.users.findFirst({
    where: eq(users.email, demo.email),
    columns: { id: true },
  });
  if (existingByEmail) {
    const [row] = await database
      .update(users)
      .set({ ...sharedFields, clerkId: demo.clerkId })
      .where(eq(users.email, demo.email))
      .returning({ id: users.id });
    return row;
  }

  const [row] = await database
    .insert(users)
    .values({
      clerkId: demo.clerkId,
      country: "BO",
      ...sharedFields,
    })
    .returning({ id: users.id });
  return row;
}

async function enrollUser(
  database: Database,
  userId: number,
  festivalId: number,
  termsVersionId: number,
) {
  const existing = await database.query.userRequests.findFirst({
    where: and(
      eq(userRequests.userId, userId),
      eq(userRequests.festivalId, festivalId),
      eq(userRequests.type, "festival_participation"),
    ),
    columns: { id: true },
  });
  if (existing) {
    await database
      .update(userRequests)
      .set({
        status: "accepted",
        termsVersionId,
        updatedAt: new Date(),
      })
      .where(eq(userRequests.id, existing.id));
    return;
  }

  await database.insert(userRequests).values({
    userId,
    festivalId,
    type: "festival_participation",
    status: "accepted",
    termsVersionId,
  });
}

async function standHasLiveNonSeedOccupancy(
  database: Database,
  standId: number,
  seedUserIds: Set<number>,
  now: Date,
) {
  const [liveHold] = await database
    .select({ id: standHolds.id, userId: standHolds.userId })
    .from(standHolds)
    .where(and(eq(standHolds.standId, standId), gt(standHolds.expiresAt, now)))
    .limit(1);
  if (liveHold && !seedUserIds.has(liveHold.userId)) return true;

  const [liveReservation] = await database
    .select({
      id: standReservations.id,
      ownerUserId: standReservations.ownerUserId,
    })
    .from(standReservations)
    .where(
      and(
        eq(standReservations.standId, standId),
        sql`${standReservations.status} <> 'rejected'`,
      ),
    )
    .limit(1);
  return (
    liveReservation != null &&
    liveReservation.ownerUserId != null &&
    !seedUserIds.has(liveReservation.ownerUserId)
  );
}

async function ensureSeedReservation(
  database: Database,
  input: {
    standId: number;
    festivalId: number;
    ownerUserId: number;
    revealAt: Date | null;
    price: number;
    seedUserIds: Set<number>;
    now: Date;
  },
) {
  if (
    await standHasLiveNonSeedOccupancy(
      database,
      input.standId,
      input.seedUserIds,
      input.now,
    )
  ) {
    return;
  }

  const [existing] = await database
    .select({
      id: standReservations.id,
      ownerUserId: standReservations.ownerUserId,
    })
    .from(standReservations)
    .where(
      and(
        eq(standReservations.standId, input.standId),
        sql`${standReservations.status} <> 'rejected'`,
      ),
    )
    .limit(1);

  let reservationId = existing?.id;
  if (!existing) {
    const [created] = await database
      .insert(standReservations)
      .values({
        standId: input.standId,
        festivalId: input.festivalId,
        status: "accepted",
        source: "admin_assignment",
        ownerUserId: input.ownerUserId,
        revealAt: input.revealAt,
        priceAmountSnapshot: input.price,
      })
      .returning({ id: standReservations.id });
    reservationId = created.id;
  } else if (existing.ownerUserId === input.ownerUserId) {
    await database
      .update(standReservations)
      .set({
        revealAt: input.revealAt,
        status: "accepted",
        updatedAt: new Date(),
      })
      .where(eq(standReservations.id, existing.id));
  }

  if (reservationId == null) return;

  const [participation] = await database
    .select({ id: reservationParticipants.id })
    .from(reservationParticipants)
    .where(
      and(
        eq(reservationParticipants.reservationId, reservationId),
        eq(reservationParticipants.userId, input.ownerUserId),
      ),
    )
    .limit(1);
  if (!participation) {
    await database.insert(reservationParticipants).values({
      reservationId,
      userId: input.ownerUserId,
    });
  }

  await database
    .update(stands)
    .set({ status: "reserved", updatedAt: new Date() })
    .where(eq(stands.id, input.standId));
}

async function ensureExpiredHold(
  database: Database,
  input: {
    standId: number;
    festivalId: number;
    userId: number;
    seedUserIds: Set<number>;
    now: Date;
  },
) {
  if (
    await standHasLiveNonSeedOccupancy(
      database,
      input.standId,
      input.seedUserIds,
      input.now,
    )
  ) {
    return;
  }

  const [existing] = await database
    .select({
      id: standHolds.id,
      userId: standHolds.userId,
      expiresAt: standHolds.expiresAt,
    })
    .from(standHolds)
    .where(eq(standHolds.standId, input.standId))
    .limit(1);

  if (existing && existing.expiresAt > input.now && !input.seedUserIds.has(existing.userId)) {
    return;
  }

  if (!existing) {
    const createdAt = new Date(input.now.getTime() - 20 * 60_000);
    const expiresAt = new Date(input.now.getTime() - 10 * 60_000);
    await database.insert(standHolds).values({
      standId: input.standId,
      userId: input.userId,
      festivalId: input.festivalId,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    });
  } else if (input.seedUserIds.has(existing.userId)) {
    const createdAt = new Date(input.now.getTime() - 20 * 60_000);
    await database
      .update(standHolds)
      .set({
        userId: input.userId,
        createdAt,
        expiresAt: new Date(input.now.getTime() - 10 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(standHolds.id, existing.id));
  }

  await database
    .update(stands)
    .set({ status: "held", updatedAt: new Date() })
    .where(eq(stands.id, input.standId));
}

async function ensureMapElements(database: Database, sectorId: number) {
  const existing = await database.query.mapElements.findMany({
    where: eq(mapElements.festivalSectorId, sectorId),
    columns: { id: true, type: true },
  });
  if (existing.length > 0) return;

  await database.insert(mapElements).values([
    {
      festivalSectorId: sectorId,
      type: "entrance",
      label: "Entrada",
      labelPosition: "bottom",
      positionLeft: 20,
      positionTop: 2,
      width: 8,
      height: 4,
    },
    {
      festivalSectorId: sectorId,
      type: "bathroom",
      label: "Baños",
      labelPosition: "top",
      positionLeft: 2,
      positionTop: 36,
      width: 6,
      height: 6,
    },
  ]);
}

async function ensureJointGroup(
  database: Database,
  sectorId: number,
  jointStandIds: number[],
) {
  if (jointStandIds.length < 2) return;
  const existingGroupId = (
    await database
      .select({ standGroupId: stands.standGroupId })
      .from(stands)
      .where(eq(stands.id, jointStandIds[0]!))
      .limit(1)
  )[0]?.standGroupId;

  let groupId = existingGroupId;
  if (groupId == null) {
    const [group] = await database
      .insert(standGroups)
      .values({ festivalSectorId: sectorId })
      .returning({ id: standGroups.id });
    groupId = group.id;
  }

  for (const standId of jointStandIds) {
    await database
      .update(stands)
      .set({ standGroupId: groupId, updatedAt: new Date() })
      .where(eq(stands.id, standId));
  }
}

async function ensureSectorStands(
  database: Database,
  input: {
    festivalId: number;
    sector: SeedSectorPlan;
    sectorId: number;
    localUsers: Map<string, number>;
    seedUserIds: Set<number>;
    now: Date;
  },
) {
  const jointStandIds: number[] = [];
  let standCount = 0;

  for (let standNumber = 1; standNumber <= STANDS_PER_SECTOR; standNumber += 1) {
    const role = seedStandRole(input.sector.category, standNumber);
    const position = seedStandPosition(standNumber);
    const storedStatus = seedStandStoredStatus(role);

    const existing = await database.query.stands.findFirst({
      where: and(
        eq(stands.festivalSectorId, input.sectorId),
        eq(stands.standNumber, standNumber),
      ),
      columns: { id: true },
    });

    let standId = existing?.id;
    if (!standId) {
      const [created] = await database
        .insert(stands)
        .values({
          festivalId: input.festivalId,
          festivalSectorId: input.sectorId,
          label: input.sector.label,
          standNumber,
          standCategory: input.sector.category,
          participationType: "standard",
          status: storedStatus,
          positionLeft: position.positionLeft,
          positionTop: position.positionTop,
          width: STAND_SIZE,
          height: STAND_SIZE,
          price: input.sector.price,
        })
        .returning({ id: stands.id });
      standId = created.id;
    } else if (
      !(await standHasLiveNonSeedOccupancy(
        database,
        standId,
        input.seedUserIds,
        input.now,
      ))
    ) {
      await database
        .update(stands)
        .set({
          label: input.sector.label,
          standCategory: input.sector.category,
          participationType: "standard",
          status: storedStatus,
          positionLeft: position.positionLeft,
          positionTop: position.positionTop,
          width: STAND_SIZE,
          height: STAND_SIZE,
          price: input.sector.price,
          updatedAt: new Date(),
        })
        .where(eq(stands.id, standId));
    }

    standCount += 1;
    if (role === "joint") jointStandIds.push(standId);

    await applyStandRole(database, {
      role,
      standId,
      festivalId: input.festivalId,
      category: input.sector.category,
      price: input.sector.price,
      localUsers: input.localUsers,
      seedUserIds: input.seedUserIds,
      now: input.now,
    });
  }

  await ensureJointGroup(database, input.sectorId, jointStandIds);
  return standCount;
}

async function applyStandRole(
  database: Database,
  input: {
    role: SeedStandRole;
    standId: number;
    festivalId: number;
    category: SeedSectorPlan["category"];
    price: number;
    localUsers: Map<string, number>;
    seedUserIds: Set<number>;
    now: Date;
  },
) {
  if (input.role === "reserved_visible") {
    const ownerKey = `${input.category}_visible`;
    const ownerUserId = input.localUsers.get(ownerKey);
    if (ownerUserId == null) return;
    await ensureSeedReservation(database, {
      standId: input.standId,
      festivalId: input.festivalId,
      ownerUserId,
      revealAt: null,
      price: input.price,
      seedUserIds: input.seedUserIds,
      now: input.now,
    });
    return;
  }

  if (input.role === "reserved_hidden") {
    const ownerUserId = input.localUsers.get("illustration_hidden");
    if (ownerUserId == null) return;
    await ensureSeedReservation(database, {
      standId: input.standId,
      festivalId: input.festivalId,
      ownerUserId,
      revealAt: daysFromNow(30),
      price: input.price,
      seedUserIds: input.seedUserIds,
      now: input.now,
    });
    return;
  }

  if (input.role === "stale_held") {
    const userId = input.localUsers.get("expired_hold");
    if (userId == null) return;
    await ensureExpiredHold(database, {
      standId: input.standId,
      festivalId: input.festivalId,
      userId,
      seedUserIds: input.seedUserIds,
      now: input.now,
    });
  }
}

async function ensureFestival(database: Database) {
  const existing = await database.query.festivals.findFirst({
    where: eq(festivals.name, DEMO_FESTIVAL_NAME),
  });

  const reservationsStartDate = daysFromNow(-1);
  const eventStart = daysFromNow(14);
  const eventEnd = daysFromNow(16);
  const fields = {
    description:
      "Festival de demostración para verificar reservas, mapa DTO, polling y búsqueda de compañero.",
    status: "active" as const,
    festivalType: "glitter" as const,
    participantTermsEnabled: true,
    reservationsStartDate,
    reservationHoldMinutes: 5,
    startDate: eventStart,
    endDate: eventEnd,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await database
      .update(festivals)
      .set(fields)
      .where(eq(festivals.id, existing.id))
      .returning();
    return { festival: updated, created: false };
  }

  const [created] = await database
    .insert(festivals)
    .values({
      name: DEMO_FESTIVAL_NAME,
      ...fields,
    })
    .returning();
  return { festival: created, created: true };
}

async function ensureFestivalDate(database: Database, festivalId: number) {
  const existing = await database.query.festivalDates.findFirst({
    where: eq(festivalDates.festivalId, festivalId),
    columns: { id: true },
  });
  if (existing) return;
  await database.insert(festivalDates).values({
    festivalId,
    startDate: daysFromNow(14),
    endDate: daysFromNow(16),
  });
}

async function ensureSector(
  database: Database,
  festivalId: number,
  sector: SeedSectorPlan,
) {
  const bounds = sectorMapBounds();
  const existing = await database.query.festivalSectors.findFirst({
    where: and(
      eq(festivalSectors.festivalId, festivalId),
      eq(festivalSectors.name, sector.name),
    ),
  });
  const fields = {
    orderInFestival: sector.orderInFestival,
    description: `Sector ${sector.name} para la categoría ${sector.category}.`,
    ...bounds,
    updatedAt: new Date(),
  };
  if (existing) {
    await database
      .update(festivalSectors)
      .set(fields)
      .where(eq(festivalSectors.id, existing.id));
    return existing.id;
  }
  const [created] = await database
    .insert(festivalSectors)
    .values({
      festivalId,
      name: sector.name,
      ...fields,
    })
    .returning({ id: festivalSectors.id });
  return created.id;
}

export async function seedReservationFestival(input: {
  demoUsers: SeedDemoUsersResult["users"];
}): Promise<SeedReservationFestivalResult> {
  const { db } = await import("@/db");
  const now = new Date();

  const terms = await ensureDefaultFestivalTerms();
  if (!terms?.id) {
    throw new Error("No se pudo asegurar una versión publicada de términos.");
  }

  const localUsers = new Map<string, number>();
  for (const local of LOCAL_SEED_USERS) {
    const row = await upsertLocalSeedUser(db, local);
    if (!row?.id) {
      throw new Error(`Failed to upsert local seed user ${local.key}`);
    }
    localUsers.set(local.key, row.id);
  }

  const seedUserIds = new Set<number>(localUsers.values());

  const { festival, created } = await ensureFestival(db);
  await ensureFestivalDate(db, festival.id);

  for (const key of ENROLLED_DEMO_USER_KEYS) {
    const demo = input.demoUsers.find((user) => user.key === key);
    if (!demo) {
      throw new Error(`Missing demo user ${key} for festival enrollment`);
    }
    await enrollUser(db, demo.localUserId, festival.id, terms.id);
  }
  for (const userId of localUsers.values()) {
    await enrollUser(db, userId, festival.id, terms.id);
  }

  const sectorIds: number[] = [];
  let standCount = 0;
  for (const sector of DEMO_SECTORS) {
    const sectorId = await ensureSector(db, festival.id, sector);
    sectorIds.push(sectorId);
    await ensureMapElements(db, sectorId);
    standCount += await ensureSectorStands(db, {
      festivalId: festival.id,
      sector,
      sectorId,
      localUsers,
      seedUserIds,
      now,
    });
  }

  return {
    festivalId: festival.id,
    created,
    sectorIds,
    standCount,
  };
}
