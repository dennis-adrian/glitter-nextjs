import { ProfileType, UserSocial } from "@/app/api/users/definitions";

export function findUserSocial(
  profile: ProfileType,
  socialType: UserSocial["type"],
) {
  return profile.userSocials.find((social) => social.type === socialType);
}

export function formatUserSocialsForInsertion(data: {
  [key in UserSocial["type"]]?: string;
}): { type: UserSocial["type"]; username: string }[] {
  const socials = Object.entries(data).filter(([_, value]) => !!value);

  return socials.map(([key, value]) => ({
    type: key as UserSocial["type"],
    username: value as string,
  }));
}
