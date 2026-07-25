import { asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { infractions, sanctionInfractions, sanctions } from "@/db/schema";

export type SanctionTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function lockSanctionForMutation(
  tx: SanctionTransaction,
  sanctionId: number,
) {
  const [sanction] = await tx
    .select()
    .from(sanctions)
    .where(eq(sanctions.id, sanctionId))
    .for("update");

  return sanction ?? null;
}

export async function lockInfractionsForMutation(
  tx: SanctionTransaction,
  infractionIds: readonly number[],
) {
  if (infractionIds.length === 0) return [];

  return tx
    .select({
      id: infractions.id,
      userId: infractions.userId,
      status: infractions.status,
    })
    .from(infractions)
    .where(inArray(infractions.id, [...infractionIds]))
    .orderBy(asc(infractions.id))
    .for("update");
}

export async function fetchSanctionInfractionIds(
  tx: SanctionTransaction,
  sanctionId: number,
) {
  return tx
    .select({ infractionId: sanctionInfractions.infractionId })
    .from(sanctionInfractions)
    .where(eq(sanctionInfractions.sanctionId, sanctionId))
    .orderBy(desc(sanctionInfractions.linkedAt));
}

export async function fetchExistingSanctionLinks(
  tx: SanctionTransaction,
  infractionIds: readonly number[],
) {
  if (infractionIds.length === 0) return [];

  return tx
    .select({
      sanctionId: sanctionInfractions.sanctionId,
      infractionId: sanctionInfractions.infractionId,
    })
    .from(sanctionInfractions)
    .where(inArray(sanctionInfractions.infractionId, [...infractionIds]));
}
