import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cache } from "react";

import type { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { db } from "@/db";
import { users } from "@/db/schema";

// Profile lookups that check nothing about the caller. They live outside any
// "use server" module because every export of one is a public endpoint: from
// there, any visitor could fetch a full profile row by id or Clerk id. Callers
// pass the session's own Clerk id, or authorize before they ask.

export const getCurrentClerkUser = cache(async () => await currentUser());

export const fetchUserProfileByClerkId = async (
  clerkId: string,
): Promise<ProfileType | null> => {
  try {
    const profile = await db.query.users.findFirst({
      with: {
        userRequests: true,
        userSocials: true,
        participations: {
          with: {
            reservation: {
              with: {
                stand: true,
                festival: {
                  with: {
                    festivalDates: true,
                  },
                },
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

    return profile || null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const cachedFetchUserProfileByClerkId = cache(fetchUserProfileByClerkId);

const fetchBaseUserProfileByClerkId = async (
  clerkId: string,
): Promise<BaseProfile | null> => {
  try {
    const profile = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    });

    return profile || null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const cachedFetchBaseUserProfileByClerkId = cache(
  fetchBaseUserProfileByClerkId,
);

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

/**
 * Recipients for admin notifications. Only the id and address are read: every
 * caller mails or enqueues with those two and nothing else.
 */
export async function fetchAdminUsers(): Promise<
  Pick<BaseProfile, "id" | "email">[]
> {
  try {
    return await db.query.users.findMany({
      columns: { id: true, email: true },
      where: eq(users.role, "admin"),
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}
