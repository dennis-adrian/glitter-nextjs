"use server";

import { User } from "@clerk/nextjs/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  infractionEvidence,
  infractionNotes,
  infractions,
  pendingUserDeletions,
  rentalReturnLogs,
  scheduledTasks,
  userRequests,
  userSocials,
  users,
} from "@/db/schema";
import { revalidatePath } from "next/cache";
import { BaseProfile, ProfileType, UserCategory } from "./definitions";
import { buildNewUser, buildUserSocials } from "@/app/api/users/helpers";
import { sendEmail } from "@/app/vendors/resend";
import EmailTemplate from "@/app/emails/verification_confimation/email-template";
import {
  getFestivalAvaibleStandsByCategory,
  getFestivalCategories,
} from "@/app/lib/festivals/utils";
import ProfileRejectionEmailTemplate from "@/app/emails/profile-rejection";
import { deleteClerkUser } from "@/app/lib/users/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
  logUserStatusEvent,
  updateUserStatusWithAudit,
  verificationReasonForStatus,
} from "@/app/lib/users/status-events";
import { fetchFestival } from "@/app/lib/festivals/actions";

export type NewUser = typeof users.$inferInsert;
export type UserProfileType = typeof users.$inferSelect;
export type UserProfileWithRequests = UserProfileType & {
  userRequests: (typeof userRequests.$inferSelect)[];
};

export async function fetchUserProfileById(
  id: number,
): Promise<ProfileType | null | undefined> {
  try {
    return await db.query.users.findFirst({
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
      where: eq(users.id, id),
    });
  } catch (error) {
    console.error("Error fetching user profile", error);
    return null;
  }
}

export async function fetchUserProfile(
  clerkId: string,
): Promise<ProfileType | undefined | null> {
  try {
    return await db.query.users.findFirst({
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
      where: eq(users.clerkId, clerkId),
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchOrCreateProfile(
  user: User | null | undefined,
): Promise<ProfileType | undefined | null> {
  try {
    if (!user) throw new Error("No logged in user provided");
    const userEmail = user?.emailAddresses[0]?.emailAddress;

    if (!userEmail) throw new Error("Use has no email address");

    return await db.transaction(async (tx) => {
      const profile = await tx.query.users.findFirst({
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
        where: eq(users.email, userEmail),
      });

      if (profile) {
        if (profile.clerkId === user.id) return profile;

        await tx
          .update(users)
          .set({ clerkId: user.id })
          .where(eq(users.email, userEmail));

        return { ...profile, clerkId: user.id };
      }

      const [newUser] = await tx
        .insert(users)
        .values(buildNewUser(user))
        .returning({ id: users.id });

      return await tx.transaction(async (tx2) => {
        if (newUser?.id) {
          const userSocialsValues = buildUserSocials(newUser.id);
          await tx2.insert(userSocials).values(userSocialsValues);
          await tx2.insert(scheduledTasks).values({
            dueDate: sql`now() + interval '3 days'`,
            reminderTime: sql`now() + interval '1 days'`,
            profileId: newUser.id,
            taskType: "profile_creation",
            updatedAt: new Date(),
            createdAt: new Date(),
          });

          return await tx2.query.users.findFirst({
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
            where: eq(users.id, newUser.id),
          });
        }
      });
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchProfiles(): Promise<ProfileType[]> {
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

export async function fetchProfilesByIds(
  ids: number[],
): Promise<ProfileType[]> {
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
      where: inArray(users.id, ids),
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

const INFRACTION_BLOCK_MESSAGE =
  "No se puede eliminar un perfil con historial de infracciones.";

const RESTRICT_ACTOR_BLOCK_MESSAGE =
  "No se puede eliminar un perfil con registros administrativos vinculados.";

const PERMANENT_ERROR_PREFIX = "PERMANENT:";

type DeletionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function hasRestrictActorReferences(
  tx: DeletionTx,
  profileId: number,
): Promise<boolean> {
  const [note] = await tx
    .select({ id: infractionNotes.id })
    .from(infractionNotes)
    .where(eq(infractionNotes.authorUserId, profileId))
    .limit(1);
  if (note) return true;

  const [evidence] = await tx
    .select({ id: infractionEvidence.id })
    .from(infractionEvidence)
    .where(eq(infractionEvidence.addedByUserId, profileId))
    .limit(1);
  if (evidence) return true;

  const [returnLog] = await tx
    .select({ id: rentalReturnLogs.id })
    .from(rentalReturnLogs)
    .where(eq(rentalReturnLogs.processedByUserId, profileId))
    .limit(1);

  return Boolean(returnLog);
}

function isPermanentDeletionBlocker(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message === INFRACTION_BLOCK_MESSAGE ||
    message === RESTRICT_ACTOR_BLOCK_MESSAGE ||
    message.startsWith(PERMANENT_ERROR_PREFIX)
  ) {
    return true;
  }

  // Postgres foreign_key_violation
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  ) {
    return true;
  }

  return false;
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

export async function deleteProfile(profileId: number, prevState: FormState) {
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
        return {
          ok: true as const,
          pendingId: existingPending.id,
          clerkId: existingPending.clerkId,
          clerkAlreadyDeleted: existingPending.clerkDeletedAt !== null,
        };
      }

      const existingInfraction = await tx.query.infractions.findFirst({
        where: eq(infractions.userId, profileId),
        columns: { id: true },
      });
      if (existingInfraction) {
        return { ok: false as const, reason: "has_infractions" as const };
      }

      if (await hasRestrictActorReferences(tx, profileId)) {
        return {
          ok: false as const,
          reason: "has_restrict_references" as const,
        };
      }

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
        clerkAlreadyDeleted: false as const,
      };
    });

    if (!preparation.ok) {
      if (preparation.reason === "has_infractions") {
        return {
          success: false,
          message: INFRACTION_BLOCK_MESSAGE,
        };
      }
      if (preparation.reason === "has_restrict_references") {
        return {
          success: false,
          message: RESTRICT_ACTOR_BLOCK_MESSAGE,
        };
      }
      return { success: false, message: "Error al eliminar el perfil" };
    }

    if (!preparation.clerkAlreadyDeleted) {
      const clerkResult = await deleteClerkUser(preparation.clerkId);
      if (clerkResult.status === "request_failed") {
        const failedAt = new Date();
        await db
          .update(pendingUserDeletions)
          .set({
            lastError: `clerk_delete_failed: ${clerkResult.message}`,
            updatedAt: failedAt,
          })
          .where(eq(pendingUserDeletions.id, preparation.pendingId));
        return { success: false, message: "Error al eliminar el perfil" };
      }

      const clerkDeletedAt = new Date();
      await db
        .update(pendingUserDeletions)
        .set({
          clerkDeletedAt,
          lastError: null,
          updatedAt: clerkDeletedAt,
        })
        .where(eq(pendingUserDeletions.id, preparation.pendingId));
    }

    const now = new Date();
    try {
      await db.transaction(async (tx) => {
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
          return;
        }

        const existingInfraction = await tx.query.infractions.findFirst({
          where: eq(infractions.userId, profileId),
          columns: { id: true },
        });
        if (existingInfraction) {
          throw new Error(INFRACTION_BLOCK_MESSAGE);
        }

        if (await hasRestrictActorReferences(tx, profileId)) {
          throw new Error(RESTRICT_ACTOR_BLOCK_MESSAGE);
        }

        await tx.delete(users).where(eq(users.id, profileId));
        await tx
          .update(pendingUserDeletions)
          .set({ localDeletedAt: now, lastError: null, updatedAt: now })
          .where(eq(pendingUserDeletions.id, preparation.pendingId));
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
    }
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al eliminar el perfil" };
  }

  revalidatePath("/dashboard/users");
  return { success: true, message: "Perfil eliminado" };
}

export async function verifyProfile(profileId: number, category: UserCategory) {
  try {
    const currentProfile = await getCurrentUserProfile();

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
        createdByUserId: currentProfile?.id,
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

    await sendEmail({
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

export async function fetchAdminUsers(): Promise<BaseProfile[]> {
  try {
    return await db.query.users.findMany({
      where: eq(users.role, "admin"),
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchBaseProfileById(
  id: number,
): Promise<BaseProfile | null | undefined> {
  try {
    return await db.query.users.findFirst({
      where: eq(users.id, id),
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchBaseProfileByClerkId(
  id: string,
): Promise<BaseProfile | null | undefined> {
  try {
    return await db.query.users.findFirst({
      where: eq(users.clerkId, id),
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function disableProfile(id: number) {
  try {
    const currentProfile = await getCurrentUserProfile();

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
        createdByUserId: currentProfile?.id,
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
  try {
    const currentProfile = await getCurrentUserProfile();

    const existingProfile = await db.transaction(async (tx) => {
      const freshProfile = await tx.query.users.findFirst({
        where: eq(users.id, profile.id),
      });

      if (!freshProfile) {
        return null;
      }

      await updateUserStatusWithAudit(tx, {
        userId: profile.id,
        fromStatus: freshProfile.status,
        toStatus: "rejected",
        reason: rejectReason,
        createdByUserId: currentProfile?.id,
      });

      return freshProfile;
    });

    if (!existingProfile) {
      return { success: false, message: "Perfil no encontrado" };
    }

    await sendEmail({
      to: [existingProfile.email],
      from: "Equipo Glitter <equipo@productoraglitter.com>",
      subject: "No pudimos verificar tu perfil",
      react: ProfileRejectionEmailTemplate({
        profile: existingProfile,
        reason: rejectReason,
      }) as React.ReactElement,
    });
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
