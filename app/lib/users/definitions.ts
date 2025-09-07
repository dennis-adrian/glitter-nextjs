import {
  BaseProfile,
  ProfileSubcategoryWithSubcategory,
  UserSocial,
} from "@/app/api/users/definitions";
import { InfractionWithTypeAndFestival } from "@/app/lib/infractions/definitions";
import { sanctions } from "@/db/schema";

export type QuickViewProfile = BaseProfile & {
	profileSubcategories: ProfileSubcategoryWithSubcategory[];
	userSocials: UserSocial[];
};

export type UserSanctionBase = typeof sanctions.$inferSelect;
export type UserSanctionFull = UserSanctionBase & {
	infraction: InfractionWithTypeAndFestival;
};
