"use server";

import { fetchUserProfile } from "@/app/api/users/actions";
import { currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

export const getCurrentUserProfile = cache(async () => {
  try {
    const user = await currentUser();
    if (!user) return null;

    return await fetchUserProfile(user.id);
  } catch (error) {}
});
