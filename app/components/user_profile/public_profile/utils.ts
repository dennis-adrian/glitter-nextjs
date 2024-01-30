import { ProfileType } from "@/app/api/users/definitions";

export function findUserSocial(profile: ProfileType, socialName: string) {
  return profile.socials.find(
    (userSocial) => userSocial.social.name === socialName,
  );
}
