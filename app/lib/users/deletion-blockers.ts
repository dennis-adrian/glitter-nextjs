import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  comunicadoResends,
  comunicados,
  creditLedgerEntries,
  infractionEvidence,
  infractionNotes,
  infractions,
  invoiceCreditAllocations,
  invoices,
  orderAdjustments,
  orderReturns,
  rentalReturnLogs,
  reservationFeatureActions,
  reservationParticipants,
  reservationRequestRegistry,
  sanctions,
} from "@/db/schema";

type DeletionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Why a profile cannot be deleted, phrased for the admin who tried.
 *
 * The first four are permanent: those rows are kept on purpose (discipline,
 * who did what, and an append-only credit ledger), so nothing an admin does
 * makes the account deletable. The last one is the only one with a fix.
 */
export const PROFILE_DELETION_BLOCK_MESSAGES = {
  infractions: "No se puede eliminar un perfil con historial de infracciones.",
  sanctions: "No se puede eliminar un perfil con historial de sanciones.",
  admin_records:
    "No se puede eliminar un perfil con registros administrativos vinculados.",
  credit_history: "No se puede eliminar un perfil con historial de créditos.",
  // Deleting the account would cascade over them: the participation, and the
  // cobro with every payment and proof on it. The reservation itself would
  // survive with nobody on it.
  participations:
    "No se puede eliminar un perfil que todavía tiene participaciones o cobros de reservas. Si la persona usa otra cuenta, transferíselos desde su historial de participaciones antes de eliminarlo.",
} as const;

export type ProfileDeletionBlocker =
  keyof typeof PROFILE_DELETION_BLOCK_MESSAGES;

export function isProfileDeletionBlockMessage(message: string): boolean {
  return (Object.values(PROFILE_DELETION_BLOCK_MESSAGES) as string[]).includes(
    message,
  );
}

async function exists(query: Promise<{ id: number }[]>): Promise<boolean> {
  return (await query).length > 0;
}

/**
 * Every reference to `users` that refuses a delete, and how this module
 * accounts for it. `deletion-blockers.integration.test.ts` compares it with
 * the database, so a new RESTRICT reference cannot reach production without a
 * decision here: either a blocker checked before Clerk is touched, or a step
 * that clears the row in the delete itself.
 */
export const GUARDED_USER_REFERENCES = {
  "infractions.user_id": "infractions",
  "sanctions.user_id": "sanctions",
  "infraction_notes.author_user_id": "admin_records",
  "infraction_evidence.added_by_user_id": "admin_records",
  "rental_return_logs.processed_by_user_id": "admin_records",
  "comunicados.essential_confirmed_by_user_id": "admin_records",
  "comunicado_resends.essential_confirmed_by_user_id": "admin_records",
  "order_adjustments.actor_user_id": "admin_records",
  "order_returns.actor_user_id": "admin_records",
  "sanctions.revoked_by_user_id": "admin_records",
  "credit_ledger_entries.user_id": "credit_history",
  "invoice_credit_allocations.user_id": "credit_history",
  "reservation_feature_actions.owner_user_id": "credit_history",
  // Cleared, not blocking: see `forgetDeletedUserRequestLog`.
  "reservation_request_registry.actor_user_id": "cleared",
  // Kept and anonymised by `anonymizeProgramPurchasesForUser`.
  "session_purchases.user_id": "cleared",
} as const satisfies Record<string, ProfileDeletionBlocker | "cleared">;

/**
 * The first reason `profileId` cannot be deleted, or null.
 *
 * Run before the Clerk login is deleted, so a refusal keeps the person able to
 * sign in; and again inside the local delete, where it reports the same
 * message instead of a bare foreign-key error. Permanent reasons come first,
 * so an admin is never sent to transfer participations off an account that
 * still could not be deleted afterwards.
 */
export async function findProfileDeletionBlocker(
  tx: DeletionTx,
  profileId: number,
): Promise<ProfileDeletionBlocker | null> {
  if (
    await exists(
      tx
        .select({ id: infractions.id })
        .from(infractions)
        .where(eq(infractions.userId, profileId))
        .limit(1),
    )
  ) {
    return "infractions";
  }

  if (
    await exists(
      tx
        .select({ id: sanctions.id })
        .from(sanctions)
        .where(eq(sanctions.userId, profileId))
        .limit(1),
    )
  ) {
    return "sanctions";
  }

  const adminRecords = await Promise.all([
    exists(
      tx
        .select({ id: infractionNotes.id })
        .from(infractionNotes)
        .where(eq(infractionNotes.authorUserId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: infractionEvidence.id })
        .from(infractionEvidence)
        .where(eq(infractionEvidence.addedByUserId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: rentalReturnLogs.id })
        .from(rentalReturnLogs)
        .where(eq(rentalReturnLogs.processedByUserId, profileId))
        .limit(1),
    ),
    // Who confirmed an essential comunicado stays on record for good, and so
    // does who confirmed an essential "Enviar a más personas".
    exists(
      tx
        .select({ id: comunicados.id })
        .from(comunicados)
        .where(eq(comunicados.essentialConfirmedByUserId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: comunicadoResends.id })
        .from(comunicadoResends)
        .where(eq(comunicadoResends.essentialConfirmedByUserId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: orderAdjustments.id })
        .from(orderAdjustments)
        .where(eq(orderAdjustments.actorUserId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: orderReturns.id })
        .from(orderReturns)
        .where(eq(orderReturns.actorUserId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: sanctions.id })
        .from(sanctions)
        .where(eq(sanctions.revokedByUserId, profileId))
        .limit(1),
    ),
  ]);
  if (adminRecords.some(Boolean)) return "admin_records";

  // The ledger is append-only and its spends back the allocations and paid
  // features below, so all three are one retained history.
  const creditHistory = await Promise.all([
    exists(
      tx
        .select({ id: creditLedgerEntries.id })
        .from(creditLedgerEntries)
        .where(eq(creditLedgerEntries.userId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: invoiceCreditAllocations.id })
        .from(invoiceCreditAllocations)
        .where(eq(invoiceCreditAllocations.userId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: reservationFeatureActions.id })
        .from(reservationFeatureActions)
        .where(eq(reservationFeatureActions.ownerUserId, profileId))
        .limit(1),
    ),
  ]);
  if (creditHistory.some(Boolean)) return "credit_history";

  // Not a foreign-key refusal: both cascade. Refused anyway, because the
  // cascade would erase a festival's participation and its payments.
  const reservationRecords = await Promise.all([
    exists(
      tx
        .select({ id: reservationParticipants.id })
        .from(reservationParticipants)
        .where(eq(reservationParticipants.userId, profileId))
        .limit(1),
    ),
    exists(
      tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.userId, profileId))
        .limit(1),
    ),
  ]);
  if (reservationRecords.some(Boolean)) return "participations";

  return null;
}

/**
 * Drops the requests `profileId` made from the reservation request registry.
 *
 * The registry only exists so a retried request replays instead of running
 * twice; it is not the audit trail (`stand_reservation_events` is). Once the
 * account is gone nobody can send a request as it again, so its rows have
 * nothing left to protect — and with them in place, anyone who ever reserved
 * or paid through the app could never be deleted.
 */
export async function forgetDeletedUserRequestLog(
  tx: DeletionTx,
  profileId: number,
): Promise<void> {
  await tx
    .delete(reservationRequestRegistry)
    .where(eq(reservationRequestRegistry.actorUserId, profileId));
}
