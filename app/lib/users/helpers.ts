"use server";

import { fetchUserProfile } from "@/app/api/users/actions";
import { currentUser } from "@clerk/nextjs/server";

export async function getCurrentUserProfile() {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    return await fetchUserProfile(user.id);
  } catch (error) {}
}

export async function getCurrentUser() {
  try {
    return await currentUser();
  } catch (error) {
    return null;
  }
}
