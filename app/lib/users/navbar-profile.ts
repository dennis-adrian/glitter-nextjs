import type { NavbarProfile } from "@/app/api/users/definitions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cache } from "react";

export const fetchNavbarProfileByClerkId = async (
  clerkId: string,
): Promise<NavbarProfile | null> => {
  const profile = await db.query.users.findFirst({
    with: {
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
      profileSubcategories: {
        with: {
          subcategory: true,
        },
      },
    },
    where: eq(users.clerkId, clerkId),
  });

  return profile || null;
};

export const cachedFetchNavbarProfileByClerkId = cache(
  fetchNavbarProfileByClerkId,
);
