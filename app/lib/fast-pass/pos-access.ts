import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { hashAccessToken } from "@/app/lib/fast-pass/tokens";
import type { FastPassPosOperator } from "@/app/lib/fast-pass/definitions";
import { consumePosCredentialResolutionRateLimit } from "@/app/lib/fast-pass/pos-rate-limit";
import { db } from "@/db";
import { fastPassPosOperators } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

/** HTTP-only cookie storing the raw POS credential after route exchange. */
export const FAST_PASS_POS_COOKIE = "fast_pass_pos_credential";

export type PosOperatorAccessDenial =
  | "not_found"
  | "rate_limited"
  | "revoked"
  | "expired"
  | "wrong_settings";

export type PosOperatorAccess =
  | { granted: true; operator: FastPassPosOperator }
  | { granted: false; reason: PosOperatorAccessDenial };

export function validateOperatorForSettings(
  operator: Pick<FastPassPosOperator, "settingsId">,
  settingsId: number,
): boolean {
  return operator.settingsId === settingsId;
}

async function resolvePosOperatorByCredentialUnthrottled(
  credential: string,
  now: Date,
): Promise<PosOperatorAccess> {
  const hash = hashAccessToken(credential);

  const [operator] = await db
    .select()
    .from(fastPassPosOperators)
    .where(eq(fastPassPosOperators.accessTokenHash, hash))
    .limit(1);

  if (!operator) {
    return { granted: false, reason: "not_found" };
  }

  if (operator.revokedAt !== null) {
    return { granted: false, reason: "revoked" };
  }

  if (operator.expiresAt.getTime() <= now.getTime()) {
    return { granted: false, reason: "expired" };
  }

  return { granted: true, operator };
}

/** Resolves a POS operator after consuming the shared client-level limit. */
export async function resolvePosOperatorByCredential(
  credential: string,
  now: Date = new Date(),
): Promise<PosOperatorAccess> {
  if (!(await consumePosCredentialResolutionRateLimit())) {
    return { granted: false, reason: "rate_limited" };
  }

  return resolvePosOperatorByCredentialUnthrottled(credential, now);
}

/** Loads an active operator scoped to a settings row. */
export async function resolvePosOperatorForSettings(
  credential: string,
  settingsId: number,
  now: Date = new Date(),
): Promise<PosOperatorAccess> {
  if (!(await consumePosCredentialResolutionRateLimit())) {
    return { granted: false, reason: "rate_limited" };
  }

  const access = await resolvePosOperatorByCredentialUnthrottled(
    credential,
    now,
  );
  if (!access.granted) return access;

  if (!validateOperatorForSettings(access.operator, settingsId)) {
    return { granted: false, reason: "wrong_settings" };
  }

  return access;
}

/** Marks last use without failing the caller if the update misses. */
export async function touchPosOperatorLastUsed(
  operatorId: number,
  now: Date = new Date(),
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(fastPassPosOperators)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(
      and(
        eq(fastPassPosOperators.id, operatorId),
        isNull(fastPassPosOperators.revokedAt),
      ),
    );
}
