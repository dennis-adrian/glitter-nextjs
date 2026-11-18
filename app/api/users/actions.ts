"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { db, pool } from "@/db";
import { pendingUserDeletions, userRequests, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { BaseProfile, ProfileType, UserCategory } from "./definitions";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent } from "@/app/vendors/resend-result";
import EmailTemplate from "@/app/emails/verification_confimation/email-template";
import {
  getFestivalAvaibleStandsByCategory,
  getFestivalCategories,
} from "@/app/lib/festivals/utils";
import ProfileRejectionEmailTemplate from "@/app/emails/profile-rejection";
import { scrubDisciplinaryNotificationJobsForUser } from "@/app/lib/infractions/notifications";
import { forgetPushDevices } from "@/app/lib/notifications/push/devices";
import { scrubNotificationsNamingUser } from "@/app/lib/notifications/scrub";
import { anonymizeProgramPurchasesForUser } from "@/app/lib/programs/anonymization";
import {
  checkClerkLogin,
  deleteClerkLogin,
} from "@/app/lib/users/clerk-deletion";
import {
  findProfileDeletionBlocker,
  forgetDeletedUserRequestLog,
  isProfileDeletionBlockMessage,
  PROFILE_DELETION_BLOCK_MESSAGES,
  type ProfileDeletionBlocker,
} from "@/app/lib/users/deletion-blockers";
import {
  requireAdmin,
  requireAdminOrFestivalAdmin,
} from "@/app/lib/users/helpers";
import {
  logUserStatusEvent,
  updateUserStatusWithAudit,
  verificationReasonForStatus,
} from "@/app/lib/users/status-events";
import { fetchFestival } from "@/app/lib/festivals/queries";

export type NewUser = typeof users.$inferInsert;
export type UserProfileType = typeof users.$inferSelect;
export type UserProfileWithRequests = UserProfileType & {
  userRequests: (typeof userRequests.$inferSelect)[];
};

export async function fetchProfiles(): Promise<ProfileType[]> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return [];

  try {
    return await db.query.users.findMany({
      with: {
        userRequests: true,
        userSocials: true,
        participations: {
          with: {
            reservation: {
              with: {
                stand: true,
                festival: true,
              },
            },
          },
        },
        profileTags: {
          with: {
            tag: true,
          },
        },
        profileSubcategories: {
          with: {
            subcategory: true,
          },
        },
      },
      orderBy: desc(users.updatedAt),
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

type FormState = {
  success: boolean;
  message: string;
};

const PERMANENT_ERROR_PREFIX = "PERMANENT:";

function isPermanentDeletionBlocker(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    isProfileDeletionBlockMessage(message) ||
    message.startsWith(PERMANENT_ERROR_PREFIX)
  ) {
    return true;
  }

  // Postgres foreign_key_violation
  return hasPgErrorCode(error, "23503");
}

function toPendingDeletionError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "local_delete_failed";
  if (isPermanentDeletionBlocker(error)) {
    return message.startsWith(PERMANENT_ERROR_PREFIX)
      ? message
      : `${PERMANENT_ERROR_PREFIX} ${message}`;
  }
  return message;
}

/**
 * The refusal for an account whose Clerk login is already gone: the profile is
 * kept for the blocker's reason, and the admin is told plainly that nobody can
 * sign in to it any more, rather than reading a message that implies the
 * person still can.
 */
function strandedProfileMessage(blocker: ProfileDeletionBlocker): string {
  return `${PROFILE_DELETION_BLOCK_MESSAGES[blocker]} Su cuenta de acceso ya fue eliminada, así que esta persona ya no puede iniciar sesión con ella.`;
}

const CLERK_OUTCOME_UNKNOWN_MESSAGE =
  "No pudimos confirmar si se eliminó la cuenta de acceso. Volvé a intentar en unos minutos.";

/**
 * Settles a deletion refused for `blocker` while its pending row says the
 * login was never confirmed deleted. That can still mean an earlier attempt
 * removed it without hearing back, so Clerk is asked before the account is
 * either released (login intact: the pending row goes, so nothing keeps
 * treating the account as being deleted) or reported as stranded.
 */
async function settleRefusedDeletion(input: {
  pendingId: number;
  clerkId: string;
  blocker: ProfileDeletionBlocker;
}): Promise<string> {
  const message = PROFILE_DELETION_BLOCK_MESSAGES[input.blocker];
  const status = await checkClerkLogin(input.clerkId);
  if (status === "exists") {
    await db
      .delete(pendingUserDeletions)
      .where(
        and(
          eq(pendingUserDeletions.id, input.pendingId),
          isNull(pendingUserDeletions.clerkDeletedAt),
          isNull(pendingUserDeletions.localDeletedAt),
        ),
      );
    return message;
  }
  const now = new Date();
  if (status === "gone") {
    await db
      .update(pendingUserDeletions)
      .set({
        clerkDeletedAt: now,
        lastError: `${PERMANENT_ERROR_PREFIX} ${message}`,
        updatedAt: now,
      })
      .where(eq(pendingUserDeletions.id, input.pendingId));
    return strandedProfileMessage(input.blocker);
  }
  await db
    .update(pendingUserDeletions)
    .set({ lastError: `clerk_status_unknown: ${message}`, updatedAt: now })
    .where(eq(pendingUserDeletions.id, input.pendingId));
  return message;
}

type FinalDeletion =
  | { kind: "deleted" }
  | { kind: "blocked"; blocker: ProfileDeletionBlocker }
  | { kind: "clerk_not_deleted"; message: string }
  | { kind: "clerk_unknown"; message: string };

export async function deleteProfile(profileId: number, prevState: FormState) {
  const actor = await requireAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const preparation = await db.transaction(async (tx) => {
      const [lockedUser] = await tx
        .select({ id: users.id, clerkId: users.clerkId })
        .from(users)
        .where(eq(users.id, profileId))
        .limit(1)
        .for("update");

      if (!lockedUser) {
        return { ok: false as const, reason: "not_found" as const };
      }

      const [existingPending] = await tx
        .select({
          id: pendingUserDeletions.id,
          clerkId: pendingUserDeletions.clerkId,
          clerkDeletedAt: pendingUserDeletions.clerkDeletedAt,
        })
        .from(pendingUserDeletions)
        .where(
          and(
            eq(pendingUserDeletions.userId, lockedUser.id),
            isNull(pendingUserDeletions.localDeletedAt),
          ),
        )
        .orderBy(desc(pendingUserDeletions.updatedAt))
        .limit(1)
        .for("update");

      // A null clerkDeletedAt is a durable unknown/in-progress state. Retrying
      // the idempotent Clerk step reconciles it without creating another row.
      if (existingPending) {
        // Before Clerk goes, the retry checks what would block the local
        // delete: a reference added since the first try keeps the account.
        if (existingPending.clerkDeletedAt === null) {
          const blocker = await findProfileDeletionBlocker(tx, profileId);
          if (blocker) {
            return {
              ok: false as const,
              blocker,
              pendingId: existingPending.id,
              clerkId: existingPending.clerkId,
            };
          }
        }

        await forgetPushDevices(tx, lockedUser.id);
        return {
          ok: true as const,
          pendingId: existingPending.id,
          clerkId: existingPending.clerkId,
          clerkAlreadyDeleted: existingPending.clerkDeletedAt !== null,
        };
      }

      // Every reason the local delete would refuse, checked while the Clerk
      // login still exists: a refusal after it is gone leaves a profile
      // nobody can sign in to and nobody can delete. The user lock serializes
      // existing credit writes; the pending row makes later writes reject this
      // user until local deletion finishes.
      const blocker = await findProfileDeletionBlocker(tx, profileId);
      if (blocker) return { ok: false as const, blocker };

      const [pending] = await tx
        .insert(pendingUserDeletions)
        .values({
          userId: lockedUser.id,
          clerkId: lockedUser.clerkId,
        })
        .returning({ id: pendingUserDeletions.id });
      await forgetPushDevices(tx, lockedUser.id);

      return {
        ok: true as const,
        pendingId: pending.id,
        clerkId: lockedUser.clerkId,
        clerkAlreadyDeleted: false as const,
      };
    });

    if (!preparation.ok) {
      if (preparation.blocker) {
        // A retry of an earlier attempt: that attempt may have reached Clerk.
        if ("pendingId" in preparation && preparation.pendingId != null) {
          return {
            success: false,
            message: await settleRefusedDeletion({
              pendingId: preparation.pendingId,
              clerkId: preparation.clerkId,
              blocker: preparation.blocker,
            }),
          };
        }
        return {
          success: false,
          message: PROFILE_DELETION_BLOCK_MESSAGES[preparation.blocker],
        };
      }
      return { success: false, message: "Error al eliminar el perfil" };
    }

    // Reserved before the transaction, never from inside it: recording that
    // the login is gone must commit on its own, even if the transaction rolls
    // back, and a second connection requested from within the transaction
    // could wait on the transaction itself when the pool is exhausted.
    const recorder = await pool.connect();
    const now = new Date();
    let outcome: FinalDeletion;
    try {
      // One transaction from the last blocker check, through Clerk, to the
      // local delete, holding the account's row FOR UPDATE the whole way.
      // Every blocker is a row that references `users`, and writing one takes
      // a key-share lock on this row, so nothing can add a participation, an
      // invoice, an infraction or a sanction once the check has passed: such
      // a write waits, then fails on the missing user. The Clerk call is
      // bounded (`CLERK_CALL_TIMEOUT_MS`), so the row is never held for long.
      outcome = await db.transaction(async (tx): Promise<FinalDeletion> => {
        const [lockedUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, profileId))
          .limit(1)
          .for("update");

        if (!lockedUser) {
          await tx
            .update(pendingUserDeletions)
            .set({ localDeletedAt: now, lastError: null, updatedAt: now })
            .where(eq(pendingUserDeletions.id, preparation.pendingId));
          return { kind: "deleted" };
        }

        const blocker = await findProfileDeletionBlocker(tx, profileId);
        // Nothing written yet: returning commits nothing.
        if (blocker) return { kind: "blocked", blocker };

        if (!preparation.clerkAlreadyDeleted) {
          const clerk = await deleteClerkLogin(preparation.clerkId);
          if (clerk.kind === "not_deleted") {
            return { kind: "clerk_not_deleted", message: clerk.message };
          }
          if (clerk.kind === "unknown") {
            return { kind: "clerk_unknown", message: clerk.message };
          }
          await recorder.query(
            `UPDATE pending_user_deletions
             SET clerk_deleted_at = now(), last_error = NULL, updated_at = now()
             WHERE id = $1 AND clerk_deleted_at IS NULL`,
            [preparation.pendingId],
          );
        }

        // Its idempotency records only; RESTRICT, so they go first.
        await forgetDeletedUserRequestLog(tx, profileId);

        // Scrub outbox PII before the user row is removed; FK only nulls user_id.
        await scrubDisciplinaryNotificationJobsForUser(tx, profileId, now);
        // Their own inbox goes with the row; other people's items name them.
        await scrubNotificationsNamingUser(tx, profileId);

        // Program purchases are kept but anonymized, so attendance history and
        // seat counts survive. Required before the delete: their FK is
        // RESTRICT, so skipping this would abort the transaction.
        await anonymizeProgramPurchasesForUser(tx, profileId, now);

        await tx.delete(users).where(eq(users.id, profileId));
        await tx
          .update(pendingUserDeletions)
          .set({ localDeletedAt: now, lastError: null, updatedAt: now })
          .where(eq(pendingUserDeletions.id, preparation.pendingId));
        return { kind: "deleted" };
      });
    } catch (error) {
      console.error(error);
      await db
        .update(pendingUserDeletions)
        .set({
          lastError: toPendingDeletionError(error),
          updatedAt: new Date(),
        })
        .where(eq(pendingUserDeletions.id, preparation.pendingId));
      return { success: false, message: "Error al eliminar el perfil" };
    } finally {
      recorder.release();
    }

    if (outcome.kind === "blocked") {
      // The login was already gone before this attempt: nothing can give it
      // back, so say so instead of implying the person can still sign in.
      if (preparation.clerkAlreadyDeleted) {
        await db
          .update(pendingUserDeletions)
          .set({
            lastError: `${PERMANENT_ERROR_PREFIX} ${PROFILE_DELETION_BLOCK_MESSAGES[outcome.blocker]}`,
            updatedAt: new Date(),
          })
          .where(eq(pendingUserDeletions.id, preparation.pendingId));
        return {
          success: false,
          message: strandedProfileMessage(outcome.blocker),
        };
      }
      return {
        success: false,
        message: await settleRefusedDeletion({
          pendingId: preparation.pendingId,
          clerkId: preparation.clerkId,
          blocker: outcome.blocker,
        }),
      };
    }

    if (outcome.kind === "clerk_not_deleted") {
      // Clerk confirmed the login is still there and nothing local changed:
      // the account goes back to normal, ready for another try.
      console.error("Clerk login not deleted", {
        profileId,
        reason: outcome.message,
      });
      await db
        .delete(pendingUserDeletions)
        .where(
          and(
            eq(pendingUserDeletions.id, preparation.pendingId),
            isNull(pendingUserDeletions.clerkDeletedAt),
            isNull(pendingUserDeletions.localDeletedAt),
          ),
        );
      return { success: false, message: "Error al eliminar el perfil" };
    }

    if (outcome.kind === "clerk_unknown") {
      // Kept pending: the next try asks Clerk again and settles it.
      await db
        .update(pendingUserDeletions)
        .set({ lastError: outcome.message, updatedAt: new Date() })
        .where(eq(pendingUserDeletions.id, preparation.pendingId));
      return { success: false, message: CLERK_OUTCOME_UNKNOWN_MESSAGE };
    }
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al eliminar el perfil" };
  }

  revalidatePath("/dashboard/users");
  return { success: true, message: "Perfil eliminado" };
}

export async function verifyProfile(profileId: number, category: UserCategory) {
  const currentProfile = await requireAdmin();
  if (!currentProfile) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const updatedUser = await db.transaction(async (tx) => {
      const existingProfile = await tx.query.users.findFirst({
        where: eq(users.id, profileId),
      });

      if (!existingProfile) {
        return null;
      }

      await updateUserStatusWithAudit(tx, {
        userId: profileId,
        fromStatus: existingProfile.status,
        toStatus: "verified",
        reason: verificationReasonForStatus(existingProfile.status),
        createdByUserId: currentProfile.id,
        userUpdates: {
          verifiedAt: new Date(),
          category,
        },
      });

      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, profileId))
        .limit(1);

      return user;
    });

    if (!updatedUser) {
      return { success: false, message: "Perfil no encontrado" };
    }

    const activeFestival = await fetchFestival({
      acceptedUsersOnly: true,
    });

    const availableStands = getFestivalAvaibleStandsByCategory(
      activeFestival,
      updatedUser.category,
    );

    const festivalCategories = getFestivalCategories(activeFestival);

    // The verification is committed; a failed notice must not report it as
    // failed.
    try {
      const result = await sendEmail({
        to: [updatedUser.email],
        from: "Equipo Glitter <equipo@productoraglitter.com>",
        subject: "Perfil verificado",
        react: EmailTemplate({
          name: updatedUser.displayName || "Usuario",
          category: updatedUser.category,
          festival: festivalCategories.includes(updatedUser.category)
            ? activeFestival
            : null,
          isFestivalFull: availableStands.length === 0,
        }) as React.ReactElement,
      });
      assertSent(result);
    } catch (error) {
      console.error("Error sending profile verification email", error);
    }
  } catch (error) {
    console.error("Error verifying profile", error);
    return {
      success: false,
      message: "Error al verificar el perfil",
    };
  }

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/profile_requests");
  return { success: true, message: "Perfil verificado" };
}

export async function disableProfile(id: number) {
  const currentProfile = await requireAdmin();
  if (!currentProfile) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const existingProfile = await db.transaction(async (tx) => {
      const profile = await tx.query.users.findFirst({
        where: eq(users.id, id),
      });

      if (!profile) {
        return null;
      }

      await updateUserStatusWithAudit(tx, {
        userId: id,
        fromStatus: profile.status,
        toStatus: "banned",
        reason: "Deshabilitación manual por administrador.",
        createdByUserId: currentProfile.id,
      });

      return profile;
    });

    if (!existingProfile) {
      return { success: false, message: "Usuario no encontrado" };
    }
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al deshabilitar el usuario",
    };
  }

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/profile_requests");
  return { success: true, message: "Usuario deshabilitado correctamente" };
}

export async function rejectProfile(
  profile: BaseProfile,
  rejectReason: string,
) {
  const currentProfile = await requireAdmin();
  if (!currentProfile) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const freshProfile = await tx.query.users.findFirst({
        where: eq(users.id, profile.id),
      });

      if (!freshProfile) {
        return { result: "not_found" as const };
      }

      // Rejecting closes the pending review. Verified, paused and banned
      // accounts have their own lifecycle actions and must not land here.
      if (freshProfile.status !== "pending") {
        return { result: "not_pending" as const };
      }

      // `fromStatus` is pinned rather than read back, so a status change
      // between the read and the write fails instead of being overwritten.
      await updateUserStatusWithAudit(tx, {
        userId: profile.id,
        fromStatus: "pending",
        toStatus: "rejected",
        reason: rejectReason,
        createdByUserId: currentProfile.id,
      });

      return { result: "rejected" as const, profile: freshProfile };
    });

    if (outcome.result === "not_found") {
      return { success: false, message: "Perfil no encontrado" };
    }
    if (outcome.result === "not_pending") {
      return {
        success: false,
        message: "Solo se pueden rechazar perfiles pendientes.",
      };
    }
    const existingProfile = outcome.profile;

    // The rejection is committed; a failed notice must not report it as
    // failed.
    try {
      const result = await sendEmail({
        to: [existingProfile.email],
        from: "Equipo Glitter <equipo@productoraglitter.com>",
        subject: "No pudimos verificar tu perfil",
        react: ProfileRejectionEmailTemplate({
          profile: existingProfile,
          reason: rejectReason,
        }) as React.ReactElement,
      });
      assertSent(result);
    } catch (error) {
      console.error("Error sending profile rejection email", error);
    }
  } catch (error) {
    console.error("Error rejecting profile", error);
    return {
      success: false,
      message: "Error al rechazar el perfil",
    };
  }

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/profile_requests");
  return { success: true, message: "Perfil rechazado correctamente" };
}
