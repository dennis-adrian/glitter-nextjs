"use server";

import { fetchAdminUsers, fetchUserProfileById } from "@/app/api/users/actions";
import {
  BaseProfile,
  ProfileType,
  UpdateUser,
  UserCategory,
  UsersAggregates,
  UserSocial,
} from "@/app/api/users/definitions";
import ProfileCompletionEmailTemplate from "@/app/emails/profile-completion";
import SubcategoryUpdateEmailTemplate from "@/app/emails/subcategory-update";
import { isProfileComplete } from "@/app/lib/utils";
import { utapi } from "@/app/server/uploadthing";
import { sendEmail } from "@/app/vendors/resend";
import { db, pool } from "@/db";
import {
  profileSubcategories,
  scheduledTasks,
  users,
  userSocials,
} from "@/db/schema";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateProfile(userId: number, profile: UpdateUser) {
  const client = await pool.connect();

  try {
    await db
      .update(users)
      .set({
        ...profile,
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
  } finally {
    client.release();
  }

  revalidatePath("/my_profile");
  return {
    success: true,
    message: "Perfil actualizado correctamente",
  };
}

export async function updateProfileCategories(
  profileId: number,
  category: UserCategory,
  subcategoryIds: number[],
  options?: { sendUserEmail?: boolean },
) {
  const client = await pool.connect();

  try {
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
      await sendEmail({
        to: [fullProfile!.email],
        from: "Perfiles Glitter <perfiles@productoraglitter.com>",
        subject: "Actualización de perfil",
        react: SubcategoryUpdateEmailTemplate({
          profile: fullProfile!,
        }) as React.ReactElement,
      });
    }
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      success: false,
      message: "Error al actualizar el perfil",
    };
  } finally {
    client.release();
  }

  revalidatePath("/my_profile");
  return {
    success: true,
    message: "Perfil actualizado correctamente",
  };
}

export async function updateProfileSocials(
  profileId: number,
  socials: UserSocial[],
) {
  const client = await pool.connect();

  try {
    if (socials.length === 0) {
      return { success: false, message: "No se actualizó el perfil" };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ updatedAt: new Date() })
        .where(eq(users.id, profileId));

      socials.forEach(async (social) => {
        await tx
          .update(userSocials)
          .set({ username: social.username, updatedAt: new Date() })
          .where(eq(userSocials.id, social.id));
      });
    });
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      success: false,
      message: "Error al actualizar el perfil",
    };
  } finally {
    client.release();
  }

  revalidatePath("/my_profile");
  return {
    success: true,
    message: "Perfil actualizado correctamente",
  };
}

export async function verifyProfileCompletion(userId: number) {
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
      await sendEmail({
        to: [...adminEmails, "perfiles@productoraglitter.com"],
        from: "Perfiles Glitter <perfiles@productoraglitter.com>",
        subject: `${fullProfile.displayName} ha completado su perfil`,
        react: ProfileCompletionEmailTemplate({
          profile: fullProfile,
        }) as React.ReactElement,
      });
    }
  }
}

export async function updateProfilePicture(
  profile: BaseProfile,
  imageUrl: string,
) {
  const oldImageUrl = profile.imageUrl;
  try {
    await db
      .update(users)
      .set({
        imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, profile.id));

    if (oldImageUrl && oldImageUrl.includes("utfs")) {
      const [_, key] = oldImageUrl.split("/f/");
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
}): Promise<UsersAggregates> {
  let allowedRoles: BaseProfile["role"][] = ["admin", "festival_admin", "user"];
  let allowedStatuses: BaseProfile["status"][] = [
    "pending",
    "verified",
    "banned",
    "rejected",
  ];
  let allowedCategories: UserCategory[] = [
    "none",
    "illustration",
    "gastronomy",
    "entrepreneurship",
  ];

  if (filters) {
    const { includeAdmins, status, category } = filters;
    allowedRoles = includeAdmins ? allowedRoles : ["user"];
    allowedStatuses = status && status.length > 0 ? status : allowedStatuses;
    allowedCategories =
      category && category.length > 0 ? category : allowedCategories;
  }

  try {
    const rows = await db
      .select({ total: count() })
      .from(users)
      .where(
        and(
          inArray(users.role, allowedRoles),
          inArray(users.status, allowedStatuses),
          inArray(users.category, allowedCategories),
        ),
      );
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
  limit?: number;
  offset?: number;
  includeAdmins?: boolean;
  status?: BaseProfile["status"][];
  category?: UserCategory[];
  query?: string;
}): Promise<ProfileType[]> {
  const { limit, offset, includeAdmins, status, category, query } = filters;
  const allowedRoles = includeAdmins
    ? ["admin", "festival_admin", "user"]
    : ["user"];
  const allowedStatuses = (
    status && status.length > 0
      ? status
      : ["pending", "verified", "banned", "rejected"]
  ) as BaseProfile["status"][];
  const allowedCategories: UserCategory[] = category || [
    "entrepreneurship",
    "illustration",
    "gastronomy",
    "none",
  ];

  try {
    return await db.query.users.findMany({
      with: {
        userRequests: true,
        userSocials: true,
        participations: {
          with: {
            reservation: true,
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
      where: and(
        inArray(users.role, allowedRoles as BaseProfile["role"][]),
        inArray(users.status, allowedStatuses as BaseProfile["status"][]),
        inArray(users.category, allowedCategories),
        or(
          ilike(users.displayName, "%" + query + "%"),
          ilike(users.firstName, "%" + query + "%"),
          ilike(users.lastName, "%" + query + "%"),
          ilike(users.email, "%" + query + "%"),
          ilike(users.phoneNumber, "%" + query + "%"),
        ),
      ),
      orderBy: desc(users.updatedAt),
    });
  } catch (error) {
    console.error("Error fetching user profiles", error);
    return [];
  }
}
