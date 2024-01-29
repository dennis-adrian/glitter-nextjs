'use server';

import { redirect } from 'next/navigation';

import { clerkClient } from '@clerk/nextjs';
import { User } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { client, db } from '@/db';
import { users } from '@/db/schema';
import { revalidatePath } from 'next/cache';

type NewUser = typeof users.$inferInsert;
export type UserProfileType = typeof users.$inferSelect;

export async function createUserProfile(user: User) {
  const newUser = {
    clerkId: user.id,
    email: user.emailAddresses[0].emailAddress,
    firstName: user.firstName,
    imageUrl: user.imageUrl,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`,
  } as NewUser;

  try {
    await db.insert(users).values(newUser);
  } catch (error) {
    await deleteClerkUser(user);
    return {
      message: 'Error creating user profile',
    };
  }

  redirect('/user_profile');
}

export async function fetchUserProfile(user: User) {
  try {
    const result: UserProfileType[] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, user.id));

    return {
      user: result[0],
    };
  } catch (error) {
    return {
      message: 'Error fetching user profile',
      error,
    };
  }
}

export async function isProfileCreated(user: User) {
  const data = await fetchUserProfile(user);
  return !!data.user;
}

export async function deleteClerkUser(user: User) {
  try {
    await clerkClient.users.deleteUser(user.id);
    redirect('/sign_up');
  } catch (error) {
    return {
      message: 'Error deleting user',
      error,
    };
  }
}

const FormSchema = z.object({
  id: z.number(),
  firstName: z
    .string()
    .min(2, { message: 'El nombre tiene que tener al menos dos letras' }),
  lastName: z
    .string()
    .min(2, { message: 'El apellido tiene que tener al menos dos letras' }),
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
  console.log('updating profile', formData);
  const validateFields = UpdateName.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  });

  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Error de validación',
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
      message: 'Error de Base de Datos: No se pudo actualizar el perfil',
    };
  }

  revalidatePath('/user_profile');
}

export async function updateProfileWithValidatedData(
  id: number,
  data: UserProfileType,
) {
  const { firstName, lastName, birthdate } = data;
  try {
    await db
      .update(users)
      .set({
        firstName,
        lastName,
        birthdate,
      })
      .where(eq(users.id, id));
  } catch (error) {
    return {
      message: 'Error de Base de Datos: No se pudo actualizar el perfil',
    };
  }

  revalidatePath('/user_profile');
  return { success: true };
}

const ExampleSchema = FormSchema.omit({ id: true });

export async function createExample(formData: FormData) {
  const { firstName, lastName } = ExampleSchema.parse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  });

  console.log(firstName, lastName);
}
