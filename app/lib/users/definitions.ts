import {
  BaseProfile,
  ProfileSubcategoryWithSubcategory,
  UserSocial,
} from "@/app/api/users/definitions";
import { sanctions } from "@/db/schema";

export type QuickViewProfile = BaseProfile & {
	profileSubcategories: ProfileSubcategoryWithSubcategory[];
	userSocials: UserSocial[];
};

export type UserSanctionBase = typeof sanctions.$inferSelect;
