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
  firstName: z.string().min(3, { message: 'El nombre es requerido' }),
  lastName: z.string().min(3, { message: 'El apellido es requerido' }),
});

// export type State = {
//   errors?: {
//     firstName?: string;
//     lastName?: string;
//   }
//   message: string | null;
// }

const UpdateName = FormSchema.omit({ id: true });
export async function updateProfile(id: number, formData: FormData) {
  const { firstName, lastName } = UpdateName.parse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  });

  await db
    .update(users)
    .set({
      firstName,
      lastName,
    })
    .where(eq(users.id, id));

  revalidatePath('/user_profile');
}

const ExampleSchema = FormSchema.omit({ id: true });

export async function createExample(formData: FormData) {
  const { firstName, lastName } = ExampleSchema.parse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  });

  console.log(firstName, lastName);
}
