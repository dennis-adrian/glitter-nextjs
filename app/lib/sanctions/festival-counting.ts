import { and, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { logSanctionEvent } from "@/app/lib/sanctions/events";
import {
  calculateReservationEligibleAt,
  festivalActivationQualifiesSanction,
} from "@/app/lib/sanctions/festival-qualification";
import { db } from "@/db";
import {
  festivalDates,
  festivals,
  sanctionFestivals,
  sanctions,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type QualifySanctionsForFestivalResult = {
  associatedSanctionIds: number[];
};

function getFestivalFinalDate(
  dates: ReadonlyArray<{ endDate: Date }>,
): Date | null {
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.endDate.getTime())));
}

/**
 * Idempotently associates applicable sanctions with a festival that just
 * transitioned to active. Safe to call repeatedly for the same festival.
 */
export async function associateSanctionsWithActivatedFestival(
  tx: DbTx,
  input: {
    festivalId: number;
    activatedAt: Date;
  },
): Promise<QualifySanctionsForFestivalResult> {
  const festival = await tx.query.festivals.findFirst({
    where: eq(festivals.id, input.festivalId),
    columns: {
      id: true,
      festivalType: true,
      reservationsStartDate: true,
    },
    with: {
      festivalDates: {
        columns: {
          endDate: true,
        },
      },
    },
  });

  if (!festival) {
    return { associatedSanctionIds: [] };
  }

  const festivalEndAt = getFestivalFinalDate(festival.festivalDates);
  const candidates = await tx.query.sanctions.findMany({
    where: inArray(sanctions.status, ["active", "scheduled"]),
    columns: {
      id: true,
      type: true,
      status: true,
      festivalScope: true,
      approvedAt: true,
      startsAt: true,
      endsAt: true,
      reservationDelayMinutes: true,
    },
  });

  const associatedSanctionIds: number[] = [];

  for (const sanction of candidates) {
    if (
      !festivalActivationQualifiesSanction({
        activatedAt: input.activatedAt,
        approvedAt: sanction.approvedAt,
        startsAt: sanction.startsAt,
        endsAt: sanction.endsAt,
        festivalEndAt,
        sanctionStatus: sanction.status,
        festivalScope: sanction.festivalScope,
        festivalType: festival.festivalType,
      })
    ) {
      continue;
    }

    const reservationEligibleAt = calculateReservationEligibleAt({
      reservationsStartDate: festival.reservationsStartDate,
      reservationDelayMinutes: sanction.reservationDelayMinutes,
      sanctionType: sanction.type,
    });

    const inserted = await tx
      .insert(sanctionFestivals)
      .values({
        sanctionId: sanction.id,
        festivalId: festival.id,
        qualifiedAt: input.activatedAt,
        reservationEligibleAt,
        countsTowardDuration: true,
      })
      .onConflictDoNothing({
        target: [sanctionFestivals.sanctionId, sanctionFestivals.festivalId],
      })
      .returning({ sanctionId: sanctionFestivals.sanctionId });

    if (inserted.length > 0) {
      associatedSanctionIds.push(sanction.id);
    }
  }

  return { associatedSanctionIds };
}

async function activateScheduledSanctions(tx: DbTx, now: Date) {
  const activated = await tx
    .update(sanctions)
    .set({
      status: "active",
      active: true,
      updatedAt: now,
    })
    .where(
      and(
        eq(sanctions.status, "scheduled"),
        lte(sanctions.startsAt, now),
        or(isNull(sanctions.endsAt), gt(sanctions.endsAt, now)),
      ),
    )
    .returning({ id: sanctions.id });

  for (const sanction of activated) {
    await logSanctionEvent(tx, {
      sanctionId: sanction.id,
      actorUserId: null,
      eventType: "activated",
      fromStatus: "scheduled",
      toStatus: "active",
      note: "Activada automáticamente al alcanzar la fecha de inicio",
    });
  }

  return activated.map((sanction) => sanction.id);
}

/**
 * Marks qualified festivals as counted once their current official final date
 * has passed, expires completed festival-based sanctions, activates scheduled
 * sanctions, and expires calendar-based sanctions. Every update is conditional,
 * making concurrent cron executions safe and idempotent.
 */
export async function reconcileSanctionFestivalCounting(input?: {
  now?: Date;
}): Promise<{
  activatedSanctionIds: number[];
  countedAssociations: number;
  expiredSanctionIds: number[];
}> {
  const now = input?.now ?? new Date();

  return db.transaction(async (tx) => {
    const activatedSanctionIds = await activateScheduledSanctions(tx, now);

    const pending = await tx
      .select({
        sanctionId: sanctionFestivals.sanctionId,
        festivalId: sanctionFestivals.festivalId,
        festivalEndAt: sql<Date>`max(${festivalDates.endDate})`.as(
          "festival_end_at",
        ),
      })
      .from(sanctionFestivals)
      .innerJoin(
        festivalDates,
        eq(festivalDates.festivalId, sanctionFestivals.festivalId),
      )
      .innerJoin(sanctions, eq(sanctions.id, sanctionFestivals.sanctionId))
      .where(
        and(
          isNull(sanctionFestivals.countedAt),
          eq(sanctionFestivals.countsTowardDuration, true),
          eq(sanctions.validityUnit, "festivals"),
          inArray(sanctions.status, ["active", "scheduled"]),
        ),
      )
      .groupBy(
        sanctionFestivals.sanctionId,
        sanctionFestivals.festivalId,
        sanctions.startsAt,
      )
      .having(
        and(
          lte(sql`max(${festivalDates.endDate})`, now),
          gt(sql`max(${festivalDates.endDate})`, sanctions.startsAt),
        ),
      );

    let countedAssociations = 0;
    const touchedSanctionIds = new Set<number>();

    for (const row of pending) {
      const updated = await tx
        .update(sanctionFestivals)
        .set({
          countedAt: now,
          festivalEndAt: row.festivalEndAt,
        })
        .where(
          and(
            eq(sanctionFestivals.sanctionId, row.sanctionId),
            eq(sanctionFestivals.festivalId, row.festivalId),
            isNull(sanctionFestivals.countedAt),
            eq(sanctionFestivals.countsTowardDuration, true),
          ),
        )
        .returning({ sanctionId: sanctionFestivals.sanctionId });

      if (updated.length > 0) {
        countedAssociations += 1;
        touchedSanctionIds.add(row.sanctionId);
      }
    }

    const expiredSanctionIds: number[] = [];

    for (const sanctionId of touchedSanctionIds) {
      const [sanction] = await tx
        .select({
          id: sanctions.id,
          status: sanctions.status,
          validityUnit: sanctions.validityUnit,
          validityDuration: sanctions.validityDuration,
        })
        .from(sanctions)
        .where(eq(sanctions.id, sanctionId))
        .for("update");

      if (
        !sanction ||
        sanction.validityUnit !== "festivals" ||
        sanction.validityDuration == null ||
        sanction.validityDuration <= 0 ||
        (sanction.status !== "active" && sanction.status !== "scheduled")
      ) {
        continue;
      }

      const [countRow] = await tx
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(sanctionFestivals)
        .where(
          and(
            eq(sanctionFestivals.sanctionId, sanctionId),
            eq(sanctionFestivals.countsTowardDuration, true),
            sql`${sanctionFestivals.countedAt} IS NOT NULL`,
          ),
        );

      const counted = countRow?.total ?? 0;
      if (counted < sanction.validityDuration) continue;

      const expired = await tx
        .update(sanctions)
        .set({
          status: "expired",
          active: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(sanctions.id, sanctionId),
            inArray(sanctions.status, ["active", "scheduled"]),
          ),
        )
        .returning({ id: sanctions.id });

      if (expired.length === 0) continue;

      await logSanctionEvent(tx, {
        sanctionId,
        actorUserId: null,
        eventType: "expired",
        fromStatus: sanction.status,
        toStatus: "expired",
        changes: {
          countedFestivals: counted,
          validityDuration: sanction.validityDuration,
        },
        note: "Expirada automáticamente al completar la validez por festivales",
      });

      expiredSanctionIds.push(sanctionId);
    }

    const calendarDue = await tx.query.sanctions.findMany({
      where: and(
        inArray(sanctions.status, ["active", "scheduled"]),
        ne(sanctions.validityUnit, "festivals"),
        sql`${sanctions.endsAt} IS NOT NULL`,
        lte(sanctions.endsAt, now),
      ),
      columns: {
        id: true,
        status: true,
      },
    });

    for (const sanction of calendarDue) {
      if (expiredSanctionIds.includes(sanction.id)) continue;

      const expired = await tx
        .update(sanctions)
        .set({
          status: "expired",
          active: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(sanctions.id, sanction.id),
            inArray(sanctions.status, ["active", "scheduled"]),
            lte(sanctions.endsAt, now),
          ),
        )
        .returning({ id: sanctions.id });

      if (expired.length === 0) continue;

      await logSanctionEvent(tx, {
        sanctionId: sanction.id,
        actorUserId: null,
        eventType: "expired",
        fromStatus: sanction.status,
        toStatus: "expired",
        note: "Expirada automáticamente por validez de calendario",
      });
      expiredSanctionIds.push(sanction.id);
    }

    return {
      activatedSanctionIds,
      countedAssociations,
      expiredSanctionIds,
    };
  });
}

/**
 * Recalculates reservation eligibility for delay associations whose original
 * eligibility time has not yet begun. Every change is recorded in the
 * sanction audit timeline.
 */
export async function recalculateReservationEligibleAtForFestival(
  tx: DbTx,
  input: {
    festivalId: number;
    reservationsStartDate: Date;
    actorUserId?: number | null;
    now?: Date;
  },
): Promise<number[]> {
  const now = input.now ?? new Date();

  const associations = await tx.query.sanctionFestivals.findMany({
    where: eq(sanctionFestivals.festivalId, input.festivalId),
    with: {
      sanction: {
        columns: {
          id: true,
          type: true,
          reservationDelayMinutes: true,
        },
      },
    },
  });

  const updatedSanctionIds: number[] = [];
  for (const association of associations) {
    if (association.sanction.type !== "reservation_delay") continue;

    const nextEligibleAt = calculateReservationEligibleAt({
      reservationsStartDate: input.reservationsStartDate,
      reservationDelayMinutes: association.sanction.reservationDelayMinutes,
      sanctionType: association.sanction.type,
    });

    if (
      association.reservationEligibleAt &&
      association.reservationEligibleAt.getTime() <= now.getTime()
    ) {
      continue;
    }

    if (
      (association.reservationEligibleAt?.getTime() ?? null) ===
      (nextEligibleAt?.getTime() ?? null)
    ) {
      continue;
    }

    await tx
      .update(sanctionFestivals)
      .set({ reservationEligibleAt: nextEligibleAt })
      .where(
        and(
          eq(sanctionFestivals.sanctionId, association.sanctionId),
          eq(sanctionFestivals.festivalId, association.festivalId),
        ),
      );

    await logSanctionEvent(tx, {
      sanctionId: association.sanctionId,
      actorUserId: input.actorUserId ?? null,
      eventType: "reservation_eligibility_changed",
      changes: {
        festivalId: input.festivalId,
        from: association.reservationEligibleAt?.toISOString() ?? null,
        to: nextEligibleAt?.toISOString() ?? null,
      },
      note: "Elegibilidad recalculada por cambio en el inicio de reservaciones del festival",
    });

    updatedSanctionIds.push(association.sanctionId);
  }

  return updatedSanctionIds;
}
