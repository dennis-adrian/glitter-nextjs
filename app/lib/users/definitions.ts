import {
  BaseProfile,
  ProfileSubcategoryWithSubcategory,
  UserSocial,
} from "@/app/api/users/definitions";

export type QuickViewProfile = BaseProfile & {
  profileSubcategories: ProfileSubcategoryWithSubcategory[];
  userSocials: UserSocial[];
};
