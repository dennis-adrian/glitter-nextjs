"use server";

import { User } from "@clerk/nextjs/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { scheduledTasks, userRequests, userSocials, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import {
	BaseProfile,
	NewUserSocial,
	ProfileType,
	UserCategory,
} from "./definitions";
import { buildNewUser, buildUserSocials } from "@/app/api/users/helpers";
import { isProfileComplete } from "@/app/lib/utils";
import { sendEmail } from "@/app/vendors/resend";
import EmailTemplate from "@/app/emails/verification_confimation/email-template";
import ProfileCompletionEmailTemplate from "@/app/emails/profile-completion";
import { fetchFestival } from "@/app/data/festivals/actions";
import {
	getFestivalAvaibleStandsByCategory,
	getFestivalCategories,
} from "@/app/lib/festivals/utils";
import ProfileRejectionEmailTemplate from "@/app/emails/profile-rejection";
import { deleteClerkUser } from "@/app/lib/users/actions";

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
						reservation: true,
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
						reservation: true,
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
		const userEmail = user.emailAddresses[0].emailAddress;
		return await db.transaction(async (tx) => {
			const profile = await tx.query.users.findFirst({
				with: {
					userRequests: true,
					userSocials: true,
					participations: {
						with: {
							reservation: true,
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
									reservation: true,
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
						reservation: true,
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
						reservation: true,
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

const FormSchema = z.object({
  id: z.number(),
  firstName: z
    .string()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  lastName: z
    .string()
    .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
});

export type State =
  | {
      errors?: {
        firstName?: string[];
        lastName?: string[];
      };
      message: string;
    }
  | undefined;

const UpdateName = FormSchema.omit({ id: true });
export async function updateProfile(
  id: number,
  prevState: State,
  formData: FormData,
) {
  const validateFields = UpdateName.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });

  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: "Error de validación",
    };
  }

  // preparte data for insertion
  const { firstName, lastName } = validateFields.data;

  try {
    await db
      .update(users)
      .set({
        firstName,
        lastName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      message: "Error de Base de Datos: No se pudo actualizar el perfil",
    };
  }

  revalidatePath("/my_profile");
}

export async function updateProfileWithValidatedData(
  id: number,
  data: ProfileType & { socials?: NewUserSocial[] },
) {
  const {
    firstName,
    lastName,
    birthdate,
    category,
    phoneNumber,
    imageUrl,
    displayName,
    bio,
    socials,
  } = data;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          bio,
          birthdate,
          category,
          displayName,
          firstName,
          imageUrl,
          lastName,
          phoneNumber,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      socials?.forEach(async (social) => {
        await tx
          .update(userSocials)
          .set({ username: social.username, updatedAt: new Date() })
          .where(sql`${userSocials.id} = ${social.id}`);
      });
    });

    const profile = await fetchUserProfileById(id);
    if (profile && isProfileComplete(profile)) {
      await db
        .update(scheduledTasks)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(scheduledTasks.profileId, id),
            eq(scheduledTasks.taskType, "profile_creation"),
          ),
        );

      // // we only want to send the email hopefully once, for the profile to be verified
      // // once verified we don't care to send it again
      if (profile.status !== "verified") {
        const admins = await fetchAdminUsers();
        const adminEmails = admins.map((admin) => admin.email);
        await sendEmail({
          to: [...adminEmails],
          from: "Perfiles Glitter <perfiles@productoraglitter.com>",
          subject: `${profile.displayName} ha completado su perfil`,
          react: ProfileCompletionEmailTemplate({
            profile: profile,
          }) as React.ReactElement,
        });
      }
    }
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      message: "Error al guardar los cambios. Intenta de nuevo",
    };
  }

  revalidatePath("/my_profile");
  return { success: true };
}

type FormState = {
  success: boolean;
  message: string;
};
export async function deleteProfile(profileId: number, prevState: FormState) {
  try {
    const deletedUsers = await db
      .delete(users)
      .where(eq(users.id, profileId))
      .returning();

    deletedUsers.forEach(async (deletedUsers) => {
			await deleteClerkUser(deletedUsers.clerkId);
    });
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
