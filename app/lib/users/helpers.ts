"use server";

import { fetchUserProfile } from "@/app/api/users/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

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

export async function protectRoute(
  currentUser?: BaseProfile,
  profileId?: number,
) {
  if (!(currentUser && profileId)) redirect("/");

  const canAccessResource =
    (currentUser.id === profileId || currentUser.role === "admin") &&
    !currentUser.banned &&
    currentUser.verified;

  if (!canAccessResource) redirect("/my_profile");
}
