"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { db } from "@/db";
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
import { CLERK_CALL_TIMEOUT_MS } from "@/app/lib/users/clerk-deletion";
import {
  finalizeProfileDeletion,
  noteDeletionError,
  releaseRefusedDeletion,
  type LoginState,
} from "@/app/lib/users/profile-deletion";
import {
  findProfileDeletionBlocker,
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

/** The refusal, with what is known about the account's login. */
function refusalMessage(
  blocker: ProfileDeletionBlocker,
  login: LoginState,
): string {
  const reason = PROFILE_DELETION_BLOCK_MESSAGES[blocker];
  if (login === "gone") {
    return `${reason} Su cuenta de acceso ya fue eliminada, así que esta persona ya no puede iniciar sesión con ella.`;
  }
  if (login === "unknown") {
    return `${reason} No pudimos confirmar si su cuenta de acceso sigue activa: volvé a intentar en unos minutos.`;
  }
  return reason;
}

const CLERK_OUTCOME_UNKNOWN_MESSAGE =
  "No pudimos confirmar si se eliminó la cuenta de acceso. Volvé a intentar en unos minutos.";
const CLERK_NOT_DELETED_MESSAGE =
  "No se pudo eliminar la cuenta de acceso. El perfil quedó como estaba; volvé a intentar.";
const LOCAL_FAILED_AFTER_LOGIN_MESSAGE =
  "La cuenta de acceso ya fue eliminada, pero el perfil no se pudo borrar. Volvé a intentar; si se repite, revisá el registro de errores.";
const CONFLICT_MESSAGE =
  "Otro cambio ocurrió al mismo tiempo. Actualizá la página e intentá de nuevo.";

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

      if (existingPending) {
        // A retry. Before Clerk goes, it checks what would block the local
        // delete: a reference added since the first try keeps the account.
        // An earlier try may have reached Clerk, so a refusal here is settled
        // by `releaseRefusedDeletion` rather than reported as is.
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
        return {
          ok: true as const,
          pendingId: existingPending.id,
          clerkId: existingPending.clerkId,
        };
      }

      // Every reason the local delete would refuse, checked while the Clerk
      // login certainly still exists. The user lock serializes existing credit
      // writes; the pending row makes later writes reject this user until
      // local deletion finishes.
      const blocker = await findProfileDeletionBlocker(tx, profileId);
      if (blocker) return { ok: false as const, blocker };

      const [pending] = await tx
        .insert(pendingUserDeletions)
        .values({
          userId: lockedUser.id,
          clerkId: lockedUser.clerkId,
        })
        .returning({ id: pendingUserDeletions.id });

      return {
        ok: true as const,
        pendingId: pending.id,
        clerkId: lockedUser.clerkId,
      };
    });

    if (!preparation.ok) {
      if (!preparation.blocker) {
        return { success: false, message: "Error al eliminar el perfil" };
      }
      if ("pendingId" in preparation && preparation.pendingId != null) {
        const login = await releaseRefusedDeletion({
          profileId,
          pendingId: preparation.pendingId,
          clerkId: preparation.clerkId,
          clerkBudgetMs: CLERK_CALL_TIMEOUT_MS,
        });
        return {
          success: false,
          message: refusalMessage(preparation.blocker, login),
        };
      }
      return {
        success: false,
        message: PROFILE_DELETION_BLOCK_MESSAGES[preparation.blocker],
      };
    }

    const outcome = await finalizeProfileDeletion({
      profileId,
      pendingId: preparation.pendingId,
      clerkId: preparation.clerkId,
      clerkBudgetMs: CLERK_CALL_TIMEOUT_MS,
      // Scrub outbox PII before the user row is removed; FK only nulls user_id.
      beforeUserDelete: (tx, now) =>
        scrubDisciplinaryNotificationJobsForUser(tx, profileId, now),
    });

    switch (outcome.kind) {
      case "deleted":
        break;
      case "conflict":
        return { success: false, message: CONFLICT_MESSAGE };
      case "blocked": {
        const login = outcome.loginAlreadyGone
          ? ("gone" as const)
          : await releaseRefusedDeletion({
              profileId,
              pendingId: preparation.pendingId,
              clerkId: preparation.clerkId,
              clerkBudgetMs: CLERK_CALL_TIMEOUT_MS,
            });
        if (login === "gone") {
          await noteDeletionError(
            preparation.pendingId,
            `${PERMANENT_ERROR_PREFIX} ${PROFILE_DELETION_BLOCK_MESSAGES[outcome.blocker]}`,
          );
        }
        return {
          success: false,
          message: refusalMessage(outcome.blocker, login),
        };
      }
      case "clerk_not_deleted":
        // Clerk confirmed the login is there and this attempt's request is
        // settled: the account goes back to normal, ready for another try.
        console.error("Clerk login not deleted", {
          profileId,
          reason: outcome.message,
        });
        await releaseRefusedDeletion({
          profileId,
          pendingId: preparation.pendingId,
          clerkId: preparation.clerkId,
          clerkBudgetMs: CLERK_CALL_TIMEOUT_MS,
        });
        return { success: false, message: CLERK_NOT_DELETED_MESSAGE };
      case "clerk_unknown":
        // Kept pending with the attempt on record: the next try asks Clerk
        // again and settles it.
        return { success: false, message: CLERK_OUTCOME_UNKNOWN_MESSAGE };
      case "local_failed":
        console.error(outcome.error);
        await noteDeletionError(
          preparation.pendingId,
          toPendingDeletionError(outcome.error),
        );
        return {
          success: false,
          message: outcome.loginGone
            ? LOCAL_FAILED_AFTER_LOGIN_MESSAGE
            : "Error al eliminar el perfil",
        };
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
