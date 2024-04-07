import {
  users,
  userRequests,
  userSocials,
  reservationParticipants,
  standReservations,
  profileTasks,
  userCategoryEnum,
} from "@/db/schema";
import { z } from "zod";

export type UserSocial = typeof userSocials.$inferSelect;
type UserRequest = typeof userRequests.$inferSelect;
type Participation = typeof reservationParticipants.$inferSelect & {
  reservation: typeof standReservations.$inferSelect;
};

export type BaseProfile = typeof users.$inferSelect;
export type ProfileWithSocials = BaseProfile & {
  userSocials: UserSocial[];
};

export type ProfileType = BaseProfile & {
  userSocials: UserSocial[];
  userRequests: UserRequest[];
  participations: Participation[];
};
export type ProfileWithParticipationsAndRequests = typeof users.$inferSelect & {
  participations: Participation[];
  userRequests: (typeof userRequests.$inferSelect)[];
};

export type NewUserSocial = typeof userSocials.$inferInsert;
export type NewProfileTask = typeof profileTasks.$inferInsert;
export type UserCategory = BaseProfile["category"];
