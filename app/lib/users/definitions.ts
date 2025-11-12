import {
  BaseProfile,
  ProfileSubcategoryWithSubcategory,
  UserSocial,
} from "@/app/api/users/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import {
	InfractionBase,
	InfractionType,
	SanctionBase,
} from "@/app/lib/infractions/definitions";

export type QuickViewProfile = BaseProfile & {
	profileSubcategories: ProfileSubcategoryWithSubcategory[];
	userSocials: UserSocial[];
};

export type UserInfraction = InfractionBase & {
	type: InfractionType;
	festival: FestivalBase | null;
	sanctions: SanctionBase[];
};
