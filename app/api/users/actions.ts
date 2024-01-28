import { db } from '@/db';
import { users } from '@/db/schema';
import { User } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { clerkClient } from '@clerk/nextjs';

type NewUser = typeof users.$inferInsert;
type ExistingUser = typeof users.$inferSelect;

export async function createUserProfile(user: User) {
  const newUser = {
    clerkId: user.id,
    firstName: user.firstName,
    imageUrl: user.imageUrl,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`,
  } as NewUser;

  try {
    await db.insert(users).values(newUser);
  } catch (error) {
    // await deleteClerkUser(user);
    return {
      message: 'Error creating user profile',
    };
  }

  redirect('/user_profile');
}

export async function fetchUserProfile(user: User) {
  try {
    const result: ExistingUser[] = await db
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
