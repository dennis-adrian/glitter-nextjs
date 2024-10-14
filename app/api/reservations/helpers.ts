import { BaseProfile } from "@/app/api/users/definitions";
import { standReservations, users } from "@/db/schema";
import { buildWhereClause } from "@/db/utils";
import { sql } from "drizzle-orm";

export function getParticipantsOptions(participants: BaseProfile[]) {
  return participants.map((participant) => ({
    label: participant.displayName || "Sin nombre",
    value: participant.id.toString(),
    imageUrl: participant.imageUrl,
  }));
}

export async function buildWhereClauseForReservationsFetching(
  {
    query,
    festivalId,
  }: {
    query?: string;
    festivalId?: number;
  },
  isDrizzleQuery?: boolean,
) {
  const conditions = sql.empty();
  // if (query) {
  //   buildWhereClause(
  //     conditions,
  //     sql`(${users.displayName} ilike ${`%${query}%`} OR ${
  //       users.firstName
  //     } ilike ${`%${query}%`} OR ${users.lastName} ilike ${`%${query}%`} OR ${
  //       users.email
  //     } ilike ${`%${query}%`} OR ${users.phoneNumber} ilike ${`%${query}%`})`,
  //   );
  // }

  if (festivalId) {
    buildWhereClause(
      conditions,
      sql`${standReservations.festivalId} = ${festivalId}`,
    );
  }

  return conditions;
}
