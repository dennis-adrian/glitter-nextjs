import { ProfileType } from "@/app/api/users/definitions";

export function findUserSocial(profile: ProfileType, socialType: string) {
  return profile.userSocials.find((social) => social.type === socialType);
}

export function formatUserSocialsForInsertion(
  data: {
    instagramProfile: string;
    tiktokProfile: string;
    facebookProfile: string;
  },
  profile: ProfileType,
) {
  return Object.entries(data).map(([key, value]) => {
    const social = findUserSocial(profile, key.replace("Profile", ""));
    if (social) {
      return {
        id: social.id,
        username: value,
      };
    }
  });
}
