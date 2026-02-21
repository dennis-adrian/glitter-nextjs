"use server";

import { User } from "@clerk/nextjs/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { scheduledTasks, userRequests, userSocials, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { BaseProfile, ProfileType, UserCategory } from "./definitions";
import { buildNewUser, buildUserSocials } from "@/app/api/users/helpers";
import { sendEmail } from "@/app/vendors/resend";
import EmailTemplate from "@/app/emails/verification_confimation/email-template";
import {
	getFestivalAvaibleStandsByCategory,
	getFestivalCategories,
} from "@/app/lib/festivals/utils";
import ProfileRejectionEmailTemplate from "@/app/emails/profile-rejection";
import { deleteClerkUser } from "@/app/lib/users/actions";
import { fetchFestival } from "@/app/lib/festivals/actions";

export type NewUser = typeof users.$inferInsert;
export type UserProfileType = typeof users.$inferSelect;
export type UserProfileWithRequests = UserProfileType & {
	userRequests: (typeof userRequests.$inferSelect)[];
};

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

export async function fetchOrCreateProfile(
	user: User | null | undefined,
): Promise<ProfileType | undefined | null> {
	try {
		if (!user) throw new Error("No logged in user provided");
		const userEmail = user?.emailAddresses[0]?.emailAddress;

		if (!userEmail) throw new Error("Use has no email address");

		return await db.transaction(async (tx) => {
			const profile = await tx.query.users.findFirst({
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
				where: eq(users.email, userEmail),
			});

			if (profile) {
				if (profile.clerkId === user.id) return profile;

				await tx
					.update(users)
					.set({ clerkId: user.id })
					.where(eq(users.email, userEmail));

				return { ...profile, clerkId: user.id };
			}

			const [newUser] = await tx
				.insert(users)
				.values(buildNewUser(user))
				.returning({ id: users.id });

			return await tx.transaction(async (tx2) => {
				if (newUser?.id) {
					const userSocialsValues = buildUserSocials(newUser.id);
					await tx2.insert(userSocials).values(userSocialsValues);
					await tx2.insert(scheduledTasks).values({
						dueDate: sql`now() + interval '3 days'`,
						reminderTime: sql`now() + interval '1 days'`,
						profileId: newUser.id,
						taskType: "profile_creation",
						updatedAt: new Date(),
						createdAt: new Date(),
					});

					return await tx2.query.users.findFirst({
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
						where: eq(users.id, newUser.id),
					});
				}
			});
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function fetchProfiles(): Promise<ProfileType[]> {
	try {
		return await db.query.users.findMany({
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
			orderBy: desc(users.updatedAt),
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function fetchProfilesByIds(
	ids: number[],
): Promise<ProfileType[]> {
	try {
		return await db.query.users.findMany({
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
			orderBy: desc(users.updatedAt),
			where: inArray(users.id, ids),
		});
	} catch (error) {
		console.error(error);
		return [];
	}
}

type FormState = {
	success: boolean;
	message: string;
};
export async function deleteProfile(profileId: number, prevState: FormState) {
	try {
		const [userToDelete] = await db
			.select({ clerkId: users.clerkId })
			.from(users)
			.where(eq(users.id, profileId));

		if (!userToDelete) {
			return { success: false, message: "Error al eliminar el perfil" };
		}

		await deleteClerkUser(userToDelete.clerkId);
		await db.delete(users).where(eq(users.id, profileId));
	} catch (error) {
		console.error(error);
		return { success: false, message: "Error al eliminar el perfil" };
	}

	revalidatePath("/dashboard/users");
	return { success: true, message: "Perfil eliminado" };
}

export async function verifyProfile(profileId: number, category: UserCategory) {
	try {
		const [updatedUser] = await db
			.update(users)
			.set({
				status: "verified",
				verifiedAt: new Date(),
				updatedAt: new Date(),
				category: category,
			})
			.where(eq(users.id, profileId))
			.returning();

		if (!updatedUser) {
			return { success: false, message: "Perfil no encontrado" };
		}

		const activeFestival = await fetchFestival({
			acceptedUsersOnly: true,
		});

		const availableStands = getFestivalAvaibleStandsByCategory(
			activeFestival,
			updatedUser.category,
		);

		const festivalCategories = getFestivalCategories(activeFestival);

		await sendEmail({
			to: [updatedUser.email],
			from: "Equipo Glitter <equipo@productoraglitter.com>",
			subject: "Perfil verificado",
			react: EmailTemplate({
				name: updatedUser.displayName || "Usuario",
				category: updatedUser.category,
				festival: festivalCategories.includes(updatedUser.category)
					? activeFestival
					: null,
				isFestivalFull: availableStands.length === 0,
				profileId: updatedUser.id,
			}) as React.ReactElement,
		});
	} catch (error) {
		console.error("Error verifying profile", error);
		return {
			success: false,
			message: "Error al verificar el perfil",
		};
	}

	revalidatePath("/dashboard/users");
	return { success: true, message: "Perfil verificado" };
}

export async function fetchAdminUsers(): Promise<BaseProfile[]> {
	try {
		return await db.query.users.findMany({
			where: eq(users.role, "admin"),
		});
	} catch (error) {
		console.error(error);
		return [];
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

export async function fetchBaseProfileByClerkId(
	id: string,
): Promise<BaseProfile | null | undefined> {
	try {
		return await db.query.users.findFirst({
			where: eq(users.clerkId, id),
		});
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function disableProfile(id: number) {
	try {
		await db.update(users).set({ status: "banned" }).where(eq(users.id, id));
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: "Error al deshabilitar el usuario",
		};
	}

	revalidatePath("/dashboard/users");
	return { success: true, message: "Usuario deshabilitado correctamente" };
}

export async function rejectProfile(
	profile: BaseProfile,
	rejectReason: string,
) {
	try {
		await db.transaction(async (tx) => {
			await tx
				.update(users)
				.set({ status: "rejected" })
				.where(eq(users.id, profile.id));

			await sendEmail({
				to: [profile.email],
				from: "Equipo Glitter <equipo@productoraglitter.com>",
				subject: "No pudimos verificar tu perfil",
				react: ProfileRejectionEmailTemplate({
					profile: profile,
					reason: rejectReason,
				}) as React.ReactElement,
			});
		});
	} catch (error) {
		console.error("Error rejecting profile", error);
		return {
			success: false,
			message: "Error al rechazar el perfil",
		};
	}

	revalidatePath("/dashboard/users");
	return { success: true, message: "Perfil rechazado correctamente" };
}
