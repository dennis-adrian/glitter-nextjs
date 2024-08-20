"use server";

import { fetchUserProfile } from "@/app/api/users/actions";
import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import { users } from "@/db/schema";
import { buildWhereClause } from "@/db/utils";
import { currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
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
    currentUser.status === "verified";

  if (!canAccessResource) redirect("/my_profile");
}

export async function buildWhereClauseForProfileFetching({
  includeAdmins,
  status,
  category,
  query,
}: {
  includeAdmins?: boolean;
  status?: BaseProfile["status"][];
  category?: UserCategory[];
  query?: string;
}) {
  const conditions = sql.empty();
  if (!includeAdmins) buildWhereClause(conditions, sql`${users.role} = 'user'`);
  if (status) buildWhereClause(conditions, sql`${users.status} in ${status}`);
  if (category) {
    buildWhereClause(conditions, sql`${users.category} in ${category}`);
  }
  if (query) {
    buildWhereClause(
      conditions,
      sql`(${users.displayName} ilike ${`%${query}%`} OR ${
        users.firstName
      } ilike ${`%${query}%`} OR ${users.lastName} ilike ${`%${query}%`} OR ${
        users.email
      } ilike ${`%${query}%`} OR ${users.phoneNumber} ilike ${`%${query}%`})`,
    );
  }
  return conditions;
}
