"use server";

import {
  getPostHogClient,
  POSTHOG_SHUTDOWN_TIMEOUT_MS,
} from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import {
  BaseProfile,
  Participation,
  UserCategory,
  UsersAggregates,
  UserSocial,
} from "@/app/api/users/definitions";
import { isParticipantSelectable } from "@/app/lib/categories/visibility";
import ProfileCompletionEmailTemplate from "@/app/emails/profile-completion";
import SubcategoryUpdateEmailTemplate from "@/app/emails/subcategory-update";
import {
  buildWhereClauseForProfileFetching,
  getCurrentUserProfile,
  requireAdminOrFestivalAdmin,
  requireProfileOwnerOrAdmin,
  requireProfileOwnerOrStaff,
} from "@/app/lib/users/helpers";
import {
  DISPLAY_NAME_MAX_LENGTH,
  pickSelfEditableProfileFields,
  SelfEditableProfile,
} from "@/app/lib/users/profile-fields";
import {
  fetchAdminUsers,
  fetchUserProfileById,
  getCurrentClerkUser,
} from "@/app/lib/users/queries";
import { verifyProfilePictureUpload } from "@/app/lib/uploadthing/profile-picture-receipt";
import { isProfileComplete } from "@/app/lib/utils";
import { utapi } from "@/app/server/uploadthing";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent } from "@/app/vendors/resend-result";
import { db } from "@/db";
import {
  profileSubcategories,
  reservationParticipants,
  scheduledTasks,
  subcategories,
  users,
  userSocials,
} from "@/db/schema";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Creates the signed-in Clerk user's own profile row. Takes no input: the
 * caller's identity and contact fields come from the session, so nobody can
 * create a row under another Clerk id or pick their own role or status.
 */
export async function createUserProfile() {
  const clerkUser = await getCurrentClerkUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!clerkUser || !email) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const newUserRes = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          clerkId: clerkUser.id,
          email,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
        })
        .onConflictDoNothing({ target: users.clerkId })
        .returning();

      if (!newUser) return null;

      await tx.insert(scheduledTasks).values({
        dueDate: sql`now() + interval '3 days'`,
        reminderTime: sql`now() + interval '1 days'`,
        profileId: newUser.id,
        taskType: "profile_creation",
      });

      return newUser;
    });

    if (newUserRes) {
      try {
        const posthog = getPostHogClient();
        posthog.capture({
          distinctId: clerkUser.id,
          event: POSTHOG_EVENTS.USER_PROFILE_CREATED,
        });
        await posthog.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
      } catch (telemetryError) {
        console.error(
          "PostHog telemetry failed (createUserProfile)",
          telemetryError,
        );
      }
    }

    return {
      success: true,
      message: "Perfil creado correctamente.",
    };
  } catch (error) {
    console.error("Error creating user profile", error);
    return {
      success: false,
      message: "Error al crear el perfil.",
    };
  }
}

export async function updateProfile(
  userId: number,
  profile: SelfEditableProfile,
) {
  const actor = await requireProfileOwnerOrAdmin(userId);
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  // The payload reaches the server as plain JSON, so the allow-list has to be
  // re-applied here: `status`, `role`, `category` and the rest of the
  // privileged columns are dropped rather than written.
  const fields = pickSelfEditableProfileFields(profile);

  if (typeof fields.displayName === "string") {
    // Check and store the same trimmed value, so trailing spaces cannot carry
    // a stored name past the limit.
    fields.displayName = fields.displayName.trim();
    if (fields.displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      return {
        success: false,
        message: `Tu nombre puede tener hasta ${DISPLAY_NAME_MAX_LENGTH} caracteres`,
      };
    }
  }

  try {
    await db
      .update(users)
      .set({
        ...fields,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await verifyProfileCompletion(userId);
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      success: false,
      message: "Error al actualizar el perfil",
    };
  }

  revalidatePath("/my_profile");
  return {
    success: true,
    message: "Perfil actualizado correctamente",
  };
}

/** The areas the onboarding picker offers a participant. */
const PARTICIPANT_CATEGORIES: readonly UserCategory[] = [
  "illustration",
  "entrepreneurship",
  "gastronomy",
];

/**
 * Whether a participant's pick has the shape the onboarding picker produces:
 * one of its areas and at least one subcategory id. An empty pick would leave
 * the profile in onboarding, and so free to recategorize, indefinitely.
 */
function isParticipantCategoryShape(
  category: UserCategory,
  subcategoryIds: number[],
) {
  return (
    PARTICIPANT_CATEGORIES.includes(category) &&
    Array.isArray(subcategoryIds) &&
    subcategoryIds.length > 0 &&
    subcategoryIds.every(Number.isInteger)
  );
}

/**
 * Whether every id names a distinct subcategory a participant may pick for
 * themselves, inside `category`. Admin-only and non-selectable rows gate
 * restricted stands, so only staff assign them.
 */
async function areParticipantSelectable(
  category: UserCategory,
  subcategoryIds: number[],
) {
  const rows = await db
    .select({
      category: subcategories.category,
      visibility: subcategories.visibility,
      isAdminAssignableOnly: subcategories.isAdminAssignableOnly,
    })
    .from(subcategories)
    .where(inArray(subcategories.id, subcategoryIds));

  // Fewer rows than ids means an unknown or a repeated id.
  return (
    rows.length === subcategoryIds.length &&
    rows.every(
      (row) =>
        row.category === category &&
        isParticipantSelectable(row.visibility, row.isAdminAssignableOnly),
    )
  );
}

export async function updateProfileCategories(
  profileId: number,
  category: UserCategory,
  subcategoryIds: number[],
  options?: { sendUserEmail?: boolean },
) {
  const actor = await requireProfileOwnerOrStaff(profileId);
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  // Category decides stand eligibility and whether festival enrollment needs
  // review, so a participant only picks it while completing their profile,
  // the one place their UI offers it. Past that, staff changes it. A
  // non-staff actor here is the owner, so `actor` is the target's own row.
  const isStaff = actor.role === "admin" || actor.role === "festival_admin";
  const isOnboarding =
    actor.category === "none" || actor.profileSubcategories.length === 0;
  if (!isStaff && !isOnboarding) {
    return { success: false, message: "No autorizado" };
  }
  if (!isStaff && !isParticipantCategoryShape(category, subcategoryIds)) {
    return { success: false, message: "No autorizado" };
  }

  try {
    if (
      !isStaff &&
      !(await areParticipantSelectable(category, subcategoryIds))
    ) {
      return { success: false, message: "No autorizado" };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ category, updatedAt: new Date() })
        .where(eq(users.id, profileId));

      // Any subcategory that was previously associated with the profile is now removed
      await tx
        .delete(profileSubcategories)
        .where(eq(profileSubcategories.profileId, profileId));

      subcategoryIds.forEach(async (subcategoryId) => {
        await tx
          .insert(profileSubcategories)
          .values({ profileId, subcategoryId });
      });
    });

    if (options && options.sendUserEmail) {
      const fullProfile = await fetchUserProfileById(profileId);
      // The update is committed; a failed notice must not report it as failed.
      try {
        const result = await sendEmail({
          to: [fullProfile!.email],
          from: "Perfiles Glitter <perfiles@productoraglitter.com>",
          subject: "Actualización de perfil",
          react: SubcategoryUpdateEmailTemplate({
            profile: fullProfile!,
          }) as React.ReactElement,
        });
        assertSent(result);
      } catch (error) {
        console.error("Error sending subcategory update email", error);
      }
    }
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      success: false,
      message: "Error al actualizar el perfil",
    };
  }

  revalidatePath("/my_profile");
  return {
    success: true,
    message: "Perfil actualizado correctamente",
  };
}

// TODO: This function should only add user social profiles. Refactor if necessary so we don't have to handle updating existing ones
export async function upsertUserSocialProfiles(
  profileId: number,
  socials: { type: UserSocial["type"]; username: string }[],
) {
  const actor = await requireProfileOwnerOrAdmin(profileId);
  if (!actor) {
    return {
      success: false,
      message: "No autorizado",
    };
  }

  try {
    const socialsTypesToInsert = socials.map((social) => social.type);

    await db.transaction(async (tx) => {
      const existingSocials = await tx.query.userSocials.findMany({
        where: and(
          eq(userSocials.userId, profileId),
          inArray(userSocials.type, socialsTypesToInsert),
        ),
      });
      const socialsToInsert = socials.filter(
        (social) => !existingSocials.some((s) => s.type === social.type),
      );

      existingSocials.forEach(async (social) => {
        const socialToUpdate = socials.find((s) => s.type === social.type);
        if (socialToUpdate) {
          await tx
            .update(userSocials)
            .set({ username: socialToUpdate.username, updatedAt: new Date() })
            .where(eq(userSocials.id, social.id));
        }
      });

      socialsToInsert.forEach(async (social) => {
        await tx.insert(userSocials).values({
          userId: profileId,
          type: social.type,
          username: social.username,
        });
      });
    });
  } catch (error) {
    console.error("Error adding user social profiles", error);
    return {
      success: false,
      message: "Error al agregar los perfiles de redes sociales",
    };
  }

  revalidatePath("/my_profile");
  return {
    success: true,
    message: "Perfil actualizado correctamente",
  };
}

// Not exported: every export of a "use server" module is a server action, and
// this one fans out admin email from a bare profile id.
async function verifyProfileCompletion(userId: number) {
  const fullProfile = await fetchUserProfileById(userId);
  if (fullProfile && isProfileComplete(fullProfile)) {
    await db
      .update(scheduledTasks)
      .set({ completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(scheduledTasks.profileId, userId),
          eq(scheduledTasks.taskType, "profile_creation"),
        ),
      );

    // we only want to send the email hopefully once, for the profile to be verified
    // once verified we don't care to send it again
    if (fullProfile.status === "pending" || fullProfile.status === "rejected") {
      const admins = await fetchAdminUsers();
      const adminEmails = admins.map((admin) => admin.email);
      // The profile update is committed; a failed notice must not report it
      // as failed.
      try {
        const result = await sendEmail({
          to: [...adminEmails],
          from: "Perfiles Glitter <perfiles@productoraglitter.com>",
          subject: `${fullProfile.displayName} ha completado su perfil`,
          react: ProfileCompletionEmailTemplate({
            profile: fullProfile,
          }) as React.ReactElement,
        });
        assertSent(result);
      } catch (error) {
        console.error("Error sending profile completion email", error);
      }
    }
  }
}

export async function updateProfilePicture(
  profileId: number,
  imageUrl: string,
  uploadReceipt?: string | null,
) {
  const actor = await requireProfileOwnerOrAdmin(profileId);
  if (!actor) {
    return {
      success: false,
      message: "No autorizado",
    };
  }

  try {
    // The previous URL is read back from the row instead of being taken from
    // the caller: it decides which uploaded file gets deleted.
    const existingProfile = await db.query.users.findFirst({
      columns: { imageUrl: true },
      where: eq(users.id, profileId),
    });
    const oldImageUrl = existingProfile?.imageUrl;

    // A new URL must be one the caller uploaded. Otherwise a user could point
    // their row at someone else's public avatar and have it deleted on their
    // next change. Re-saving the current URL changes nothing, so it needs no
    // receipt.
    if (
      imageUrl !== oldImageUrl &&
      !verifyProfilePictureUpload({
        uploaderId: actor.id,
        imageUrl,
        receipt: uploadReceipt,
      })
    ) {
      return {
        success: false,
        message: "No pudimos verificar la imagen. Vuelve a subirla.",
      };
    }

    await db
      .update(users)
      .set({
        imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, profileId));

    // Re-saving the current picture must not delete the file the row still
    // points at.
    if (
      oldImageUrl &&
      oldImageUrl !== imageUrl &&
      oldImageUrl.includes("utfs")
    ) {
      const [, key] = oldImageUrl.split("/f/");
      await utapi.deleteFiles(key);
    }
  } catch (error) {
    console.error("Error updating profile picture", error);
    return {
      success: false,
      message: "Error al actualizar la imagen de perfil",
    };
  }

  revalidatePath("/my_profile");
  return {
    success: true,
    message: "Imagen de perfil actualizada correctamente",
  };
}

export async function fetchUsersAggregates(filters?: {
  includeAdmins?: boolean;
  status?: BaseProfile["status"][];
  category?: UserCategory[];
  query?: string;
  profileCompletion?: "complete" | "incomplete" | "all";
}): Promise<UsersAggregates> {
  // `query` matches email and phone, so even a bare count would confirm
  // whether an account exists.
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return { total: 0 };

  const { includeAdmins, status, category, query, profileCompletion } =
    filters || {};
  const whereClause = await buildWhereClauseForProfileFetching(
    {
      includeAdmins,
      status,
      category,
      query,
      profileCompletion,
    },
    false,
  );

  try {
    const rows = await db
      .select({ total: count() })
      .from(users)
      .where(whereClause.queryChunks.length > 0 ? and(whereClause) : undefined);
    return {
      total: rows[0].total,
    };
  } catch (error) {
    console.error("Error fetching users aggregates", error);
    return {
      total: 0,
    };
  }
}

export async function fetchUserProfiles(filters: {
  limit: number;
  offset: number;
  includeAdmins?: boolean;
  status?: BaseProfile["status"][];
  category?: UserCategory[];
  query?: string;
  sort: keyof BaseProfile;
  direction: "asc" | "desc";
  profileCompletion: "complete" | "incomplete" | "all";
}) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return [];

  const {
    limit,
    offset,
    includeAdmins,
    status,
    category,
    query,
    sort,
    direction,
    profileCompletion,
  } = filters;

  const whereClause = await buildWhereClauseForProfileFetching(
    {
      includeAdmins,
      status,
      category,
      query,
      profileCompletion,
    },
    true,
  );

  const orderByDirection = direction === "asc" ? asc : desc;

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
      limit: limit || 100,
      offset: offset || 0,
      where: whereClause.queryChunks.length > 0 ? and(whereClause) : undefined,
      orderBy: orderByDirection(sql`${users[sort]}`),
    });
  } catch (error) {
    console.error("Error fetching user profiles", error);
    return [];
  }
}

export async function deleteUserSocial(
  socialId: number,
  pathToRevalidate?: string,
) {
  const actor = await getCurrentUserProfile();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    const social = await db.query.userSocials.findFirst({
      columns: { userId: true },
      where: eq(userSocials.id, socialId),
    });

    // A missing social and somebody else's social answer the same way, so the
    // action never confirms which ids exist.
    if (!social || (social.userId !== actor.id && actor.role !== "admin")) {
      return { success: false, message: "No autorizado" };
    }

    await db.delete(userSocials).where(eq(userSocials.id, socialId));
  } catch (error) {
    console.error("Error deleting user social", error);
    return {
      success: false,
      message: "Error al eliminar la red social.",
    };
  }

  revalidatePath(pathToRevalidate || "/my_profile");
  return {
    success: true,
    message: "Red social eliminada correctamente.",
  };
}

export async function fetchUserParticipations(
  profileId: number,
): Promise<Participation[]> {
  // Same audience as the page that lists them: the owner, or an admin.
  const actor = await requireProfileOwnerOrAdmin(profileId);
  if (!actor) return [];

  try {
    return await db.query.reservationParticipants.findMany({
      where: eq(reservationParticipants.userId, profileId),
      with: {
        reservation: {
          with: {
            stand: true,
            members: { with: { stand: true } },
            festival: {
              with: {
                festivalDates: true,
              },
            },
          },
        },
      },
      orderBy: desc(reservationParticipants.createdAt),
    });
  } catch (error) {
    console.error("Error fetching user participations", error);
    return [];
  }
}
