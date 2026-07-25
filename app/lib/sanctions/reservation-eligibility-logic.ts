import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

export type ReservationEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: "ban" | "reservation_delay";
      eligibleAt?: Date;
      sanctionIds: number[];
      message: string;
    };

export type ApplicableSanctionRow = {
  id: number;
  type: "ban" | "warning" | "reservation_delay";
  status: "scheduled" | "active" | "expired" | "revoked";
  startsAt: Date;
  endsAt: Date | null;
  reservationEligibleAt: Date | null;
};

/**
 * Pure combiner used by getReservationEligibility and unit tests.
 * Ban always wins; among delays, the latest eligibleAt is used.
 */
export function resolveReservationEligibility(
  rows: ApplicableSanctionRow[],
  now: Date,
): ReservationEligibility {
  const applicable = rows.filter((row) => {
    if (row.type === "warning") return false;
    if (row.status !== "active" && row.status !== "scheduled") return false;
    if (row.startsAt.getTime() > now.getTime()) return false;
    if (row.endsAt && row.endsAt.getTime() <= now.getTime()) return false;
    return true;
  });

  const bans = applicable.filter((row) => row.type === "ban");
  const delays = applicable.filter((row) => {
    if (row.type !== "reservation_delay") return false;
    if (!row.reservationEligibleAt) return false;
    return row.reservationEligibleAt.getTime() > now.getTime();
  });

  if (bans.length > 0) {
    return {
      eligible: false,
      reason: "ban",
      sanctionIds: [...new Set([...bans, ...delays].map((row) => row.id))].sort(
        (a, b) => a - b,
      ),
      message:
        "No puedes reservar en este festival debido a una sanción de ban activa.",
    };
  }

  if (delays.length === 0) {
    return { eligible: true };
  }

  const latestEligibleAt = delays.reduce((latest, row) => {
    const eligibleAt = row.reservationEligibleAt!;
    return eligibleAt.getTime() > latest.getTime() ? eligibleAt : latest;
  }, delays[0].reservationEligibleAt!);

  return {
    eligible: false,
    reason: "reservation_delay",
    eligibleAt: latestEligibleAt,
    sanctionIds: delays.map((row) => row.id),
    message: `Podrás reservar a partir del ${formatDate(latestEligibleAt).toLocaleString(DateTime.DATETIME_MED)}.`,
  };
}
