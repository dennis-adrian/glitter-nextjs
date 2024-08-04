import { Subcategory } from "@/app/lib/subcategories/definitions";
import { Tag } from "@/app/lib/tags/definitions";
import {
  users,
  userRequests,
  userSocials,
  reservationParticipants,
  standReservations,
  scheduledTasks,
  profileTags,
  profileSubcategories,
} from "@/db/schema";

export type UserSocial = typeof userSocials.$inferSelect;
type UserRequest = typeof userRequests.$inferSelect;
type Participation = typeof reservationParticipants.$inferSelect & {
  reservation: typeof standReservations.$inferSelect;
};

export type NewUser = typeof users.$inferInsert;
export type UpdateUser = Partial<NewUser>;
export type BaseProfile = typeof users.$inferSelect;
export type ProfileWithSocials = BaseProfile & {
  userSocials: UserSocial[];
};
export type ProfileTag = typeof profileTags.$inferSelect;
export type ProfileTagWithTag = typeof profileTags.$inferSelect & {
  tag: Tag;
};

export type ProfileSubcategory = typeof profileSubcategories.$inferSelect;
export type ProfileSubcategoryWithSubcategory = ProfileSubcategory & {
  subcategory: Subcategory;
};
export type ProfileType = BaseProfile & {
  userSocials: UserSocial[];
  userRequests: UserRequest[];
  participations: Participation[];
  profileTags: ProfileTagWithTag[];
  profileSubcategories: ProfileSubcategoryWithSubcategory[];
};
export type ProfileWithParticipationsAndRequests = typeof users.$inferSelect & {
  participations: Participation[];
  userRequests: (typeof userRequests.$inferSelect)[];
};

export type NewUserSocial = typeof userSocials.$inferInsert;
export type NewProfileTask = typeof scheduledTasks.$inferInsert;
export type UserCategory = BaseProfile["category"];
