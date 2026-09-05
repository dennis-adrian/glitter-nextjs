import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { reservationRequestRegistry } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const RESERVATION_REQUEST_OPERATIONS = [
  "createOrReplaceStandHold",
  "confirmStandHold",
  "submitPaymentProof",
  "applyInvoiceCredits",
  "createInvoiceCreditTopUp",
  "submitZeroValueInvoice",
  "createAdminReservation",
  "adminConfirmReservation",
  "extendReservationPaymentDeadline",
  "createExternalParticipantReservation",
  "correctSettlementProof",
  "activateFullTableAccess",
  "deactivateFullTableAccess",
  "downgradeFullTableReservation",
  "createFeatureCreditTopUp",
  "createDebtCreditTopUp",
  "releaseReservation",
] as const;

export type ReservationRequestOperation =
  (typeof RESERVATION_REQUEST_OPERATIONS)[number];

export type RequestScope = Record<string, unknown>;
export type RequestResultIds = Record<string, number | string | null>;

export type ClaimRequestResult =
  | { kind: "claimed" }
  | { kind: "replayed"; resultIds: RequestResultIds }
  | { kind: "conflict" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalizeScope(scope: RequestScope): RequestScope {
  const keys = Object.keys(scope).sort();
  const out: RequestScope = {};
  for (const key of keys) {
    const value = scope[key];
    if (value === undefined) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
      continue;
    }
    if (isPlainObject(value)) {
      out[key] = canonicalizeScope(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function scopesEqual(left: unknown, right: unknown): boolean {
  const a = isPlainObject(left) ? canonicalizeScope(left) : left;
  const b = isPlainObject(right) ? canonicalizeScope(right) : right;
  return JSON.stringify(a) === JSON.stringify(b);
}

async function loadRequestRow(tx: DbTx, requestKey: string) {
  const [row] = await tx
    .select()
    .from(reservationRequestRegistry)
    .where(eq(reservationRequestRegistry.requestKey, requestKey))
    .limit(1)
    .for("update");
  return row ?? null;
}

function interpretExisting(input: {
  row: {
    operation: string;
    actorUserId: number;
    scope: unknown;
    status: string;
    resultIds: unknown;
  };
  operation: ReservationRequestOperation;
  actorUserId: number;
  scope: RequestScope;
}): ClaimRequestResult {
  const canonical = canonicalizeScope(input.scope);
  if (
    input.row.operation !== input.operation ||
    input.row.actorUserId !== input.actorUserId ||
    !scopesEqual(input.row.scope, canonical)
  ) {
    return { kind: "conflict" };
  }
  if (input.row.status === "completed") {
    const resultIds = isPlainObject(input.row.resultIds)
      ? (input.row.resultIds as RequestResultIds)
      : {};
    return { kind: "replayed", resultIds };
  }
  return { kind: "conflict" };
}

export async function claimRequest(
  tx: DbTx,
  input: {
    requestKey: string;
    operation: ReservationRequestOperation;
    actorUserId: number;
    scope: RequestScope;
  },
  options?: {
    /** Integration-test seam: invoked after the first registry lookup. */
    testHooks?: {
      afterInitialLookup?: () => void | Promise<void>;
    };
  },
): Promise<ClaimRequestResult> {
  const scope = canonicalizeScope(input.scope);
  const existing = await loadRequestRow(tx, input.requestKey);
  await options?.testHooks?.afterInitialLookup?.();
  if (existing) {
    return interpretExisting({
      row: existing,
      operation: input.operation,
      actorUserId: input.actorUserId,
      scope,
    });
  }

  const inserted = await tx
    .insert(reservationRequestRegistry)
    .values({
      requestKey: input.requestKey,
      operation: input.operation,
      actorUserId: input.actorUserId,
      scope,
      status: "in_progress",
    })
    .onConflictDoNothing({ target: reservationRequestRegistry.requestKey })
    .returning();

  if (inserted.length > 0) {
    return { kind: "claimed" };
  }

  const raced = await loadRequestRow(tx, input.requestKey);
  if (!raced) return { kind: "conflict" };
  return interpretExisting({
    row: raced,
    operation: input.operation,
    actorUserId: input.actorUserId,
    scope,
  });
}

export async function completeRequest(
  tx: DbTx,
  requestKey: string,
  resultIds: RequestResultIds,
) {
  await tx
    .update(reservationRequestRegistry)
    .set({
      status: "completed",
      resultIds,
      updatedAt: new Date(),
    })
    .where(eq(reservationRequestRegistry.requestKey, requestKey));
}

export async function abandonRequest(tx: DbTx, requestKey: string) {
  await tx
    .delete(reservationRequestRegistry)
    .where(eq(reservationRequestRegistry.requestKey, requestKey));
}
