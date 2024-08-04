import { ProfileType, UserSocial } from "@/app/api/users/definitions";

export function findUserSocial(profile: ProfileType, socialType: string) {
  return profile.userSocials.find((social) => social.type === socialType);
}

export function formatUserSocialsForInsertion(
  data: {
    instagramProfile: string;
    tiktokProfile?: string;
    facebookProfile?: string;
  },
  profile: ProfileType,
) {
  const socials = Object.entries(data).map(([key, value]) => {
    const social = findUserSocial(profile, key.replace("Profile", ""));
    if (social) {
      return {
        ...social,
        username: value,
      };
    }
  });

  return socials.filter((social) => social?.username !== "") as UserSocial[];
}
