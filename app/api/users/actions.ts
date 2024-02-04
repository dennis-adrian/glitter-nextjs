"use server";

import { redirect } from "next/navigation";

import { clerkClient } from "@clerk/nextjs";
import { User } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { pool, db } from "@/db";
import { userRequests, userSocials, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { NewUserSocial, ProfileType } from "./definitions";

type NewUser = typeof users.$inferInsert;
export type UserProfileType = typeof users.$inferSelect;
export type UserProfileWithRequests = UserProfileType & {
  userRequests: (typeof userRequests.$inferSelect)[];
};

export async function createUserProfile(user: User) {
  const client = await pool.connect();

  const newUser: NewUser = {
    clerkId: user.id,
    email: user.emailAddresses[0].emailAddress,
    firstName: user.firstName || "",
    imageUrl: user.imageUrl || "",
    lastName: user.lastName || "",
    displayName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
  };

  try {
    await db.transaction(async (tx) => {
      const newUsers = await tx
        .insert(users)
        .values(newUser)
        .returning({ userId: users.id });

      const userId = newUsers[0].userId;

      if (user) {
        await tx.insert(userSocials).values([
          {
            userId: userId,
            type: "instagram",
            username: "",
          },
          {
            userId: userId,
            type: "tiktok",
            username: "",
          },
          {
            userId: userId,
            type: "facebook",
            username: "",
          },
          {
            userId: userId,
            type: "twitter",
            username: "",
          },
          {
            userId: userId,
            type: "youtube",
            username: "",
          },
        ]);
      }
    });
  } catch (error) {
    console.error("Error creating user profile", error);
    await deleteClerkUser(user);
    return {
      message: "Error creating user profile",
    };
  } finally {
    client.release();
  }

  redirect("/user_profile");
}

export async function fetchUserProfileById(id: number) {
  const client = await pool.connect();

  try {
    const user = await db.query.users.findFirst({
      with: {
        userRequests: true,
        userSocials: true,
      },
      where: eq(users.id, id),
    });

    return {
      user,
    };
  } catch (error) {
    console.error("Error fetching user profile", error);
    return {
      message: "Error fetching user profile",
      error,
    };
  } finally {
    client.release();
  }
}

export async function fetchUserProfile(id: string) {
  const client = await pool.connect();

  try {
    const user = await db.query.users.findFirst({
      with: {
        userRequests: true,
        userSocials: true,
        participations: {
          with: {
            reservation: true,
          },
        },
      },
      where: eq(users.clerkId, id),
    });
    return {
      user,
    };
  } catch (error) {
    console.error(error);
    return {
      message: "Error fetching user profile",
      error,
    };
  } finally {
    client.release();
  }
}

export async function fetchProfiles(): Promise<ProfileType[]> {
  const client = await pool.connect();

  try {
    const users = await db.query.users.findMany({
      with: {
        userRequests: true,
        userSocials: true,
      },
    });
    return users;
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    client.release();
  }
}

export async function isProfileCreated(user: User) {
  const data = await fetchUserProfile(user.id);
  return !!data.user;
}

export async function deleteClerkUser(user: User) {
  try {
    await clerkClient.users.deleteUser(user.id);
    redirect("/sign_up");
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

  revalidatePath("/user_profile");
}

export async function updateProfileWithValidatedData(
  id: number,
  data: ProfileType & { socials?: NewUserSocial[] },
) {
  const client = await pool.connect();
  // console.log("updating profile", data);
  const {
    firstName,
    lastName,
    birthdate,
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
          .set({ username: social.username })
          .where(sql`${userSocials.id} = ${social.id}`);
      });
    });
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      message: "Error de Base de Datos: No se pudo actualizar el perfil",
    };
  } finally {
    client.release();
  }

  revalidatePath("/user_profile");
  return { success: true };
}

type UserRequest = typeof userRequests.$inferInsert;
export async function createUserRequest(request: UserRequest) {
  const client = await pool.connect();

  try {
    await db.insert(userRequests).values(request);
  } catch {
    return {
      message: "Error de Base de Datos: No se pudo crear la solicitud",
    };
  } finally {
    client.release();
  }

  revalidatePath("/user_profile");
  return { success: true };
}
