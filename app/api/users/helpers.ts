import { NewUser } from "@/app/api/users/actions";
import { NewProfileTask, NewUserSocial } from "@/app/api/users/definitions";
import { userSocialTypeEnum } from "@/db/schema";
import { User } from "@clerk/nextjs/server";

export function buildNewUser(user: User): NewUser {
  return {
    clerkId: user.id,
    email: user.emailAddresses[0].emailAddress,
    firstName: user.firstName,
    imageUrl: user.imageUrl,
    lastName: user.lastName,
    displayName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
  };
}

export function buildUserSocials(userId: number): NewUserSocial[] {
  return userSocialTypeEnum.enumValues.map((type) => {
    return {
      userId: userId,
      type: type,
      username: "",
    };
  });
}
