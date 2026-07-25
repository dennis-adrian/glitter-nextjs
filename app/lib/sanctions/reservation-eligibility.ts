import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  resolveReservationEligibility,
  type ReservationEligibility,
} from "@/app/lib/sanctions/reservation-eligibility-logic";
import { db } from "@/db";
import { festivals, sanctionFestivals, sanctions } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EligibilityExecutor = typeof db | DbTx;

export type {
  ApplicableSanctionRow,
  ReservationEligibility,
} from "@/app/lib/sanctions/reservation-eligibility-logic";
export { resolveReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility-logic";

/**
 * Authoritative reservation eligibility for a participant in a festival.
 * Warnings never block. Uses sanction_festivals associations for the festival.
 */
export async function getReservationEligibility(
  input: {
    userId: number;
    festivalId: number;
    now?: Date;
  },
  executor: EligibilityExecutor = db,
): Promise<ReservationEligibility> {
  const now = input.now ?? new Date();

  const festival = await executor.query.festivals.findFirst({
    where: eq(festivals.id, input.festivalId),
    columns: { id: true },
  });

  if (!festival) {
    throw new Error("Festival no encontrado");
  }

  const rows = await executor
    .select({
      id: sanctions.id,
      type: sanctions.type,
      status: sanctions.status,
      startsAt: sanctions.startsAt,
      endsAt: sanctions.endsAt,
      reservationEligibleAt: sanctionFestivals.reservationEligibleAt,
    })
    .from(sanctions)
    .innerJoin(
      sanctionFestivals,
      and(
        eq(sanctionFestivals.sanctionId, sanctions.id),
        eq(sanctionFestivals.festivalId, input.festivalId),
      ),
    )
    .where(
      and(
        eq(sanctions.userId, input.userId),
        inArray(sanctions.status, ["active", "scheduled"]),
        inArray(sanctions.type, ["ban", "reservation_delay"]),
        lte(sanctions.startsAt, now),
        or(isNull(sanctions.endsAt), sql`${sanctions.endsAt} > ${now}`),
      ),
    );

  return resolveReservationEligibility(rows, now);
}
