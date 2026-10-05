import "server-only";

import { and, desc, eq, getTableColumns } from "drizzle-orm";

import { ParticipantProduct } from "@/app/lib/participant_products/definitions";
import { groupProductsByStatus } from "@/app/lib/participant_products/utils";
import { requireProfileOwnerOrStaff } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  participantProducts,
  reservationParticipants,
  standReservations,
} from "@/db/schema";

/**
 * A participant's product submissions for one festival. Only the participant
 * and staff may read them; anyone else gets an empty list.
 */
export async function fetchParticipantProducts(
  profileId: number,
  festivalId: number,
): Promise<ParticipantProduct[]> {
  const actor = await requireProfileOwnerOrStaff(profileId);
  if (!actor) return [];

  try {
    const participantProductsColumns = getTableColumns(participantProducts);
    const productsRes = await db
      .select(participantProductsColumns)
      .from(participantProducts)
      .leftJoin(
        reservationParticipants,
        eq(participantProducts.participationId, reservationParticipants.id),
      )
      .leftJoin(
        standReservations,
        eq(reservationParticipants.reservationId, standReservations.id),
      )
      .leftJoin(festivals, eq(standReservations.festivalId, festivals.id))
      .where(
        and(
          eq(participantProducts.userId, profileId),
          eq(standReservations.festivalId, festivalId),
        ),
      )
      .orderBy(desc(participantProducts.createdAt));

    const groupedProducts = groupProductsByStatus(productsRes);

    return Object.values(groupedProducts).flat();
  } catch (error) {
    console.error("Error fetching participant products", error);
    return [];
  }
}

/**
 * The products submitted under one participation. The staff review page and
 * the participant both read it; anyone else gets an empty list.
 */
export async function fetchParticipantProductsByParticipationId(
  profileId: number,
  participationId: number,
): Promise<ParticipantProduct[]> {
  const actor = await requireProfileOwnerOrStaff(profileId);
  if (!actor) return [];

  try {
    return await db.query.participantProducts.findMany({
      where: and(
        eq(participantProducts.participationId, participationId),
        eq(participantProducts.userId, profileId),
      ),
      orderBy: desc(participantProducts.createdAt),
    });
  } catch (error) {
    console.error(
      "Error fetching participant products by participation id",
      error,
    );
    return [];
  }
}
