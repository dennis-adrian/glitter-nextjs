"use server";

import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import {
	cachedFetchUserProfileByClerkId,
	getCurrentClerkUser,
} from "@/app/lib/users/actions";
import { users } from "@/db/schema";
import { buildWhereClause } from "@/db/utils";
import { eq, isNotNull, isNull, like, not, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function getCurrentUserProfile() {
	try {
		const user = await getCurrentClerkUser();
		if (!user) return null;

		// TODO: if the profile is not found, it should log out the user
		return await cachedFetchUserProfileByClerkId(user.id);
	} catch (error) {}
}

export async function protectRoute(currentUser?: BaseProfile, profileId?: number) {
	if (!(currentUser && profileId)) redirect("/");

	const canAccessResource =
		(currentUser.id === profileId || currentUser.role === "admin") &&
		currentUser.status === "verified";

	if (!canAccessResource) redirect("/my_profile");
}

export async function buildWhereClauseForProfileFetching(
	{
		includeAdmins,
		status,
		category,
		query,
		profileCompletion = "incomplete",
	}: {
		includeAdmins?: boolean;
		status?: BaseProfile["status"][];
		category?: UserCategory[];
		query?: string;
		profileCompletion?: "complete" | "incomplete" | "all";
	},
	isDrizzleQuery: boolean,
) {
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

	if (isDrizzleQuery) {
		if (profileCompletion === "complete") {
			buildWhereClause(
				conditions,
				sql`(${isNotNull(users.bio)} and ${isNotNull(
					users.imageUrl,
				)} and ${not(like(users.imageUrl, "%clerk%"))} and ${not(like(users.imageUrl, "%edgestore%"))} and ${isNotNull(users.firstName)} and ${isNotNull(
					users.lastName,
				)} and ${isNotNull(users.phoneNumber)} and ${isNotNull(
					users.displayName,
				)} and ${isNotNull(users.gender)} and ${not(
					eq(users.category, "none"),
				)} and ${isNotNull(users.birthdate)} and ${isNotNull(
					users.country,
				)} and json_array_length("users_userSocials"."data") > 0
      and json_array_length("users_profileSubcategories"."data") > 0)`,
			);
		}

		if (profileCompletion === "incomplete") {
			buildWhereClause(
				conditions,
				sql`(${isNull(users.bio)} or ${isNull(users.imageUrl)} or ${like(
					users.imageUrl,
					"%clerk%",
				)} or ${like(users.imageUrl, "%edgestore%")} or ${isNull(users.firstName)} or ${isNull(users.lastName)} or ${isNull(
					users.phoneNumber,
				)} or ${isNull(users.displayName)} or ${isNull(users.birthdate)} or ${isNull(
					users.country,
				)} or ${isNull(users.gender)} or ${eq(users.category, "none")} or json_array_length("users_userSocials"."data") = 0
      or json_array_length("users_profileSubcategories"."data") = 0)`,
			);
		}
	} else {
		if (profileCompletion === "complete") {
			buildWhereClause(
				conditions,
				sql`(select count(*) from users as inner_users
        left join profile_subcategories on profile_subcategories.profile_id = users.id
        where profile_subcategories.id is not null) > 0
        and (select count(*) from users as inner_users
        left join user_socials on user_socials.user_id = users.id
        where (user_socials.username = '') is false) > 0`,
			);
		}

		if (profileCompletion === "incomplete") {
			buildWhereClause(
				conditions,
				sql`(select count(*) from users as inner_users
        left join profile_subcategories on profile_subcategories.profile_id = users.id
        where profile_subcategories.id is not null) = 0
        and (select count(*) from users as inner_users
        left join user_socials on user_socials.user_id = users.id
        where (user_socials.username = '') is true) > 0`,
			);
		}
	}

	return conditions;
}
