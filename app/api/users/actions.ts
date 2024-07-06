"use server";

import { redirect } from "next/navigation";

import { clerkClient, User } from "@clerk/nextjs/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { pool, db } from "@/db";
import { scheduledTasks, userRequests, userSocials, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import {
  BaseProfile,
  NewUserSocial,
  ProfileType,
  UserCategory,
} from "./definitions";
import { buildNewUser, buildUserSocials } from "@/app/api/users/helpers";
import { isProfileComplete } from "@/app/lib/utils";
import { sendEmail } from "@/app/vendors/resend";
import EmailTemplate from "@/app/emails/verification_confimation/email-template";
import ProfileCompletionEmailTemplate from "@/app/emails/profile-completion";
import { fetchActiveFestival } from "@/app/data/festivals/actions";
import {
  getFestivalAvaibleStandsByCategory,
  getFestivalCategories,
} from "@/app/lib/festivals/utils";
import { CloudCog } from "lucide-react";
import ProfileRejectionEmailTemplate from "@/app/emails/profile-rejection";

export type NewUser = typeof users.$inferInsert;
export type UserProfileType = typeof users.$inferSelect;
export type UserProfileWithRequests = UserProfileType & {
  userRequests: (typeof userRequests.$inferSelect)[];
};

export async function fetchUserProfileById(
  id: number,
): Promise<ProfileType | null | undefined> {
  const client = await pool.connect();

  try {
    return await db.query.users.findFirst({
      with: {
        userRequests: true,
        userSocials: true,
        participations: {
          with: {
            reservation: true,
          },
        },
      },
      where: eq(users.id, id),
    });
  } catch (error) {
    console.error("Error fetching user profile", error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchUserProfile(
  clerkId: string,
): Promise<ProfileType | undefined | null> {
  const client = await pool.connect();

  try {
    return await db.query.users.findFirst({
      with: {
        userRequests: true,
        userSocials: true,
        participations: {
          with: {
            reservation: true,
          },
        },
      },
      where: eq(users.clerkId, clerkId),
    });
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchOrCreateProfile(
  user: User | null | undefined,
): Promise<ProfileType | undefined | null> {
  const client = await pool.connect();

  try {
    if (!user) throw new Error("No logged in user provided");
    const userEmail = user.emailAddresses[0].emailAddress;
    return await db.transaction(async (tx) => {
      const profile = await tx.query.users.findFirst({
        with: {
          userRequests: true,
          userSocials: true,
          participations: {
            with: {
              reservation: true,
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
                  reservation: true,
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
  } finally {
    client.release();
  }
}

export async function fetchProfiles(): Promise<ProfileType[]> {
  const client = await pool.connect();

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
      },
      orderBy: desc(users.updatedAt),
    });
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    client.release();
  }
}

export async function isProfileCreated(user?: User | null) {
  if (!user) return false;

  const profile = await fetchUserProfile(user.id);
  return profile !== null || profile !== undefined;
}

export async function deleteClerkUser(user: User | { id: string }) {
  try {
    await clerkClient.users.deleteUser(user.id);
  } catch (error) {
    console.error("Error deleting user", error);
    return {
      message: "Error deleting user",
      error,
    };
  }
}

const FormSchema = z.object({
  id: z.number(),
  firstName: z
    .string()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  lastName: z
    .string()
    .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
});

export type State =
  | {
      errors?: {
        firstName?: string[];
        lastName?: string[];
      };
      message: string;
    }
  | undefined;

const UpdateName = FormSchema.omit({ id: true });
export async function updateProfile(
  id: number,
  prevState: State,
  formData: FormData,
) {
  const client = await pool.connect();
  // console.log("updating profile", formData);
  const validateFields = UpdateName.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });

  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: "Error de validación",
    };
  }

  // preparte data for insertion
  const { firstName, lastName } = validateFields.data;

  try {
    await db
      .update(users)
      .set({
        firstName,
        lastName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      message: "Error de Base de Datos: No se pudo actualizar el perfil",
    };
  } finally {
    client.release();
  }

  revalidatePath("/my_profile");
}

export async function updateProfileWithValidatedData(
  id: number,
  data: ProfileType & { socials?: NewUserSocial[] },
) {
  const client = await pool.connect();
  const {
    firstName,
    lastName,
    birthdate,
    category,
    phoneNumber,
    imageUrl,
    displayName,
    bio,
    socials,
  } = data;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          bio,
          birthdate,
          category,
          displayName,
          firstName,
          imageUrl,
          lastName,
          phoneNumber,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      socials?.forEach(async (social) => {
        await tx
          .update(userSocials)
          .set({ username: social.username, updatedAt: new Date() })
          .where(sql`${userSocials.id} = ${social.id}`);
      });
    });

    const profile = await fetchUserProfileById(id);
    if (profile && isProfileComplete(profile)) {
      await db
        .update(scheduledTasks)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(scheduledTasks.profileId, id),
            eq(scheduledTasks.taskType, "profile_creation"),
          ),
        );

      // // we only want to send the email hopefully once, for the profile to be verified
      // // once verified we don't care to send it again
      if (profile.status !== "verified") {
        const admins = await fetchAdminUsers();
        const adminEmails = admins.map((admin) => admin.email);
        await sendEmail({
          to: [...adminEmails, "perfiles@productoraglitter.com"],
          from: "Perfiles Glitter <perfiles@productoraglitter.com>",
          subject: "Perfil completado",
          react: ProfileCompletionEmailTemplate({
            profileId: profile.id,
            displayName: profile.displayName!,
          }) as React.ReactElement,
        });
      }
    }
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      message: "Error al guardar los cambios. Intenta de nuevo",
    };
  } finally {
    client.release();
  }

  revalidatePath("/my_profile");
  return { success: true };
}

type FormState = {
  success: boolean;
  message: string;
};
export async function deleteProfile(profileId: number, prevState: FormState) {
  const client = await pool.connect();

  try {
    const deletedUsers = await db
      .delete(users)
      .where(eq(users.id, profileId))
      .returning();

    deletedUsers.forEach(async (deletedUsers) => {
      await deleteClerkUser({ id: deletedUsers.clerkId });
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al eliminar el perfil" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/users");
  return { success: true, message: "Perfil eliminado" };
}

export async function verifyProfile(profileId: number, category: UserCategory) {
  const client = await pool.connect();

  try {
    const userCategory = category === "illustration" ? "new_artist" : category;
    const [updatedUser] = await db
      .update(users)
      .set({
        status: "verified",
        updatedAt: new Date(),
        category: userCategory,
      })
      .where(eq(users.id, profileId))
      .returning();

    const activeFestival = await fetchActiveFestival({
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
        profileId: updatedUser.id,
      }) as React.ReactElement,
    });
  } catch (error) {
    console.error("Error verifying profile", error);
    return {
      success: false,
      message: "Error al verificar el perfil",
    };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/users");
  return { success: true, message: "Perfil verificado" };
}

export async function fetchAdminUsers(): Promise<BaseProfile[]> {
  const client = await pool.connect();

  try {
    return await db.query.users.findMany({
      where: eq(users.role, "admin"),
    });
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    client.release();
  }
}

export async function fetchBaseProfileById(
  id: number,
): Promise<BaseProfile | null | undefined> {
  const client = await pool.connect();

  try {
    return await db.query.users.findFirst({
      where: eq(users.id, id),
    });
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    client.release();
  }
}

export async function fetchBaseProfileByClerkId(
  id: string,
): Promise<BaseProfile | null | undefined> {
  const client = await pool.connect();

  try {
    return await db.query.users.findFirst({
      where: eq(users.clerkId, id),
    });
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    client.release();
  }
}

export async function disableProfile(id: number) {
  const client = await pool.connect();

  try {
    await db.update(users).set({ status: "banned" }).where(eq(users.id, id));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Error al deshabilitar el usuario",
    };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/users");
  return { success: true, message: "Usuario deshabilitado correctamente" };
}

export async function rejectProfile(
  profile: BaseProfile,
  rejectReason: string,
) {
  const client = await pool.connect();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "rejected" })
        .where(eq(users.id, profile.id));

      await sendEmail({
        to: [profile.email],
        from: "Equipo Glitter <equipo@productoraglitter.com>",
        subject: "No pudimos verificar tu perfil",
        react: ProfileRejectionEmailTemplate({
          profile: profile,
          reason: rejectReason,
        }) as React.ReactElement,
      });
    });
  } catch (error) {
    console.error("Error rejecting profile", error);
    return {
      success: false,
      message: "Error al rechazar el perfil",
    };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard/users");
  return { success: true, message: "Perfil rechazado correctamente" };
}
