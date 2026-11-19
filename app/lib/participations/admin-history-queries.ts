import "server-only";

import { asc, eq } from "drizzle-orm";

import {
  buildAdminParticipationHistory,
  type AdminParticipationRow,
} from "@/app/lib/participations/admin-history";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { invoices, reservationParticipants } from "@/db/schema";

const PERSON_COLUMNS = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

/**
 * Every reservation an account has taken part in, for the admin user page.
 *
 * Read-only, so festival admins see it too; moving a participation between
 * accounts is a separate, global-admin command.
 */
export async function fetchAdminParticipationHistory(
  userId: number,
): Promise<AdminParticipationRow[]> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return [];

  const rows = await db.query.reservationParticipants.findMany({
    where: eq(reservationParticipants.userId, userId),
    columns: { id: true, userId: true, createdAt: true },
    with: {
      reservation: {
        columns: {
          id: true,
          status: true,
          source: true,
          ownerUserId: true,
          createdAt: true,
        },
        with: {
          stand: { columns: { label: true, standNumber: true } },
          members: {
            columns: { position: true, releasedAt: true },
            with: { stand: { columns: { label: true, standNumber: true } } },
          },
          festival: {
            columns: { id: true, name: true, status: true },
            with: {
              festivalDates: { columns: { startDate: true, endDate: true } },
            },
          },
          participants: {
            columns: { id: true, userId: true },
            with: { user: { columns: PERSON_COLUMNS } },
          },
          invoices: {
            columns: { userId: true, status: true },
            orderBy: asc(invoices.id),
          },
        },
      },
    },
  });

  return buildAdminParticipationHistory(rows);
}
