import "server-only";

import { sql } from "drizzle-orm";

import type { db } from "@/db";

export type ComunicadosTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * First key of the comunicado content lock, keyed by comunicado id (D2, D3,
 * F1, F3). Distinct from tickets (4711), festival terms (5822), reservation
 * participants (6933), the bulk lane (7044) and its test fixture (7045).
 * Each helper is its own statement, never a subquery argument: the function
 * is STRICT, and a NULL key would return without locking.
 */
export const COMUNICADO_LOCK_NS = 8155;

export async function lockComunicadoShared(
  tx: ComunicadosTx,
  comunicadoId: number,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock_shared(${COMUNICADO_LOCK_NS}::int, ${comunicadoId}::int)`,
  );
}

export async function lockComunicadoExclusive(
  tx: ComunicadosTx,
  comunicadoId: number,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${COMUNICADO_LOCK_NS}::int, ${comunicadoId}::int)`,
  );
}
