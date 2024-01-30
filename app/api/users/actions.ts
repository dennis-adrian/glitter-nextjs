"use server";

import { redirect } from "next/navigation";

import { clerkClient } from "@clerk/nextjs";
import { User } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { pool, db } from "@/db";
import { participationRequests, userRequests, users } from "@/db/schema";
import { revalidatePath } from "next/cache";

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
    await db.insert(users).values(newUser);
  } catch (error) {
    await deleteClerkUser(user);
    return {
      message: "Error creating user profile",
    };
  } finally {
    client.release();
  }

  redirect("/user_profile");
}

export async function fetchUserProfile(id: string) {
  const client = await pool.connect();

  try {
    const user = await db.query.users.findFirst({
      with: {
        userRequests: true,
      },
      where: eq(users.clerkId, id),
    });

    return {
      user,
    };
  } catch (error) {
    return {
      message: "Error fetching user profile",
      error,
    };
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
  console.log("updating profile", formData);
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
  data: UserProfileType,
) {
  const client = await pool.connect();
  // console.log('updating profile', data);
  const { firstName, lastName, birthdate, phoneNumber, imageUrl } = data;
  try {
    await db
      .update(users)
      .set({
        firstName,
        lastName,
        birthdate,
        phoneNumber,
        imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  } catch (error) {
    return {
      message: "Error de Base de Datos: No se pudo actualizar el perfil",
    };
  } finally {
    client.release();
  }

  revalidatePath("/user_profile");
  return { success: true };
}

export async function createParticipationRequest(
  festivalId: number,
  userId: number,
) {
  const client = await pool.connect();

  try {
    await db.insert(participationRequests).values({
      festivalId,
      userId,
    });
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
